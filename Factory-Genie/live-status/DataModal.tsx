import dynamic from 'next/dynamic';
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { API_HELPERS } from './URL';
import './DataModal.css';

const ThresholdGraph = dynamic(() => import('./ThresholdGraph'), {
  loading: () => (
    <div className="loadingState">
      <div className="loadingSpinner"></div>
      <p>Loading graph...</p>
    </div>
  )
});

interface DataModalProps {
  showModal: boolean;
  onClose: () => void;
  data: {
    channelKey?: string;
    deviceNo?: string;
    currentDate?: string;
    selectedShift?: string;
    percentages?: number[];
    graphDataForModal?: unknown[];
    offtime?: OffTimePayload | null;
    thresholdGraph?: ThresholdGraphPayload | null;
  } | null;
}

interface OffTimeDataItem {
  date: string;
  time: string;
  status: string;
  endtime: string;
  timediff: string;
}

interface OffTimeResult {
  channel: string;
  shift: string;
  machineName?: string;
  periods: OffTimeDataItem[];
  count?: number;
  totalPeriods?: number;
  totalDuration?: string;
}

interface OffTimePayload {
  deviceNo?: string;
  date?: string;
  minDuration?: number;
  statusFilters?: string[];
  results?: OffTimeResult[];
  totalChannels?: number;
}

interface ThresholdGraphChannelData {
  machineName?: string;
  startTime?: Record<string, string>;
  points?: Record<string, Array<[number, number]>>;
}

interface ThresholdGraphPayload {
  deviceNo?: string;
  date?: string;
  bucketMinutes?: number;
  source?: string;
  channels?: Record<string, ThresholdGraphChannelData>;
}

const DataModal: React.FC<DataModalProps> = ({ showModal, onClose, data }) => {
  const parseShortDate = (value: string) => {
    const [yearRaw, monthRaw, dayRaw] = value.split('/').map((part) => parseInt(part, 10));
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    return dayjs(new Date(year, (monthRaw || 1) - 1, dayRaw || 1));
  };

  const getShiftTimeInMinutes = (shiftTime: string | number | undefined) => {
    if (typeof shiftTime === 'number') return shiftTime;
    if (typeof shiftTime === 'string') {
      const [hours, minutes, seconds] = shiftTime.split(':').map(Number);
      return hours * 60 + minutes + (seconds ? seconds / 60 : 0);
    }
    return 0;
  };

  const calculatePercentages = (
    runTime: number,
    shiftTime: string | number | undefined,
    average: number,
    averageThreshold: number,
    workingTime?: number,
    isToday?: boolean
  ) => {
    const shiftMinutes = getShiftTimeInMinutes(shiftTime);
    let baseTime = shiftMinutes;
    if (isToday && workingTime && workingTime > 0) {
      baseTime = workingTime;
    }

    let runPercentage = baseTime > 0 ? (runTime / baseTime) * 100 : 0;
    runPercentage = Math.min(runPercentage, 100);

    let averagePercentage = averageThreshold > 0 ? (average / averageThreshold) * 100 : 0;
    averagePercentage = Math.min(averagePercentage, 150);

    return [runPercentage, averagePercentage];
  };

  const [activeTab, setActiveTab] = useState('graph');
  const [tableViewMode, setTableViewMode] = useState<'legacy' | 'v2'>('legacy');
  const [graphViewMode, setGraphViewMode] = useState<'legacy' | 'v2'>('legacy');
  const [deviceSettings, setDeviceSettings] = useState<Record<string, unknown> | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [machineName, setMachineName] = useState('');
  const [v2TableData, setV2TableData] = useState<OffTimeDataItem[]>([]);
  const [filteredV2TableData, setFilteredV2TableData] = useState<OffTimeDataItem[]>([]);
  const [v2DurationFilterMin, setV2DurationFilterMin] = useState<number>(5);
  const [v2StatusFilters, setV2StatusFilters] = useState<{ OFF: boolean; LOW: boolean; OUT: boolean; ON: boolean }>({ OFF: true, LOW: true, OUT: false, ON: false });
  const [graphData, setGraphData] = useState<unknown[]>([]);
  const [isLoadingGraphData, setIsLoadingGraphData] = useState<boolean>(false);
  const [selectedChannelKey, setSelectedChannelKey] = useState(data?.channelKey || 'ch1');
  const [selectedShiftValue, setSelectedShiftValue] = useState(data?.selectedShift || 'morning');
  const [selectedDateObj, setSelectedDateObj] = useState(parseShortDate(data?.currentDate || '1/1/24'));
  const [selectedLiveStatusPayload, setSelectedLiveStatusPayload] = useState<Record<string, any> | null>(null);
  const [isLoadingSelectedPayload, setIsLoadingSelectedPayload] = useState(false);
  const [isEditingMachine, setIsEditingMachine] = useState(false);
  const [isEditingDateShift, setIsEditingDateShift] = useState(false);

  const channelKey = selectedChannelKey;
  const deviceNo = data?.deviceNo || '';
  const currentDate = selectedDateObj.format('YY/M/D');
  const selectedShift = selectedShiftValue;

  const convertedDate = selectedDateObj.format('YY/M/D');
  const formattedDateWithShift = `${convertedDate} ${selectedShiftValue}`;

  useEffect(() => {
    if (!showModal || !data) return;
    setSelectedChannelKey(data.channelKey || 'ch1');
    setSelectedShiftValue(data.selectedShift || 'morning');
    setSelectedDateObj(parseShortDate(data.currentDate || '1/1/24'));
    setSelectedLiveStatusPayload(null);
    setIsEditingMachine(false);
    setIsEditingDateShift(false);
  }, [showModal, data]);

  useEffect(() => {
    const fetchSelectedLiveStatus = async () => {
      if (!showModal || !deviceNo) return;

      setIsLoadingSelectedPayload(true);
      try {
        const response = await axios.get('/api/factory-genie/live-status', {
          params: {
            deviceNo,
            date: selectedDateObj.format('YY/MM/DD')
          }
        });
        const nextPayload = Array.isArray(response.data?.data) ? response.data.data[0] || null : null;
        setSelectedLiveStatusPayload(nextPayload);
      } catch (error) {
        console.error('Error fetching selected live-status payload:', error);
        setSelectedLiveStatusPayload(null);
      } finally {
        setIsLoadingSelectedPayload(false);
      }
    };

    fetchSelectedLiveStatus();
  }, [showModal, deviceNo, selectedDateObj]);

  const activeOfftimePayload = selectedLiveStatusPayload?.offtime || data?.offtime || null;
  const activeThresholdGraphPayload = selectedLiveStatusPayload?.thresholdGraph || data?.thresholdGraph || null;
  const shouldAnalyzeLegacyTable = showModal && activeTab === 'table' && tableViewMode === 'legacy';
  const activeShiftPayload = useMemo(() => {
    const liveStatusShiftPayload = selectedLiveStatusPayload?.[selectedChannelKey]?.[selectedShiftValue];
    if (liveStatusShiftPayload) {
      return liveStatusShiftPayload;
    }

    if (
      data?.channelKey === selectedChannelKey &&
      data?.selectedShift === selectedShiftValue &&
      (data.currentDate || '1/1/24') === currentDate
    ) {
      return {
        run_time: 0,
        shift_time: 0,
        average: 0,
        average_threshold: 0,
        working_time: 0,
        percentages: data.percentages || [0, 0]
      };
    }

    return null;
  }, [selectedLiveStatusPayload, selectedChannelKey, selectedShiftValue, data, currentDate]);

  const availableChannelKeys = useMemo(() => {
    const settingsKeys = deviceSettings
      ? Object.keys(deviceSettings).filter((key) => /^ch\d+$/i.test(key))
      : [];
    const payloadKeys = selectedLiveStatusPayload
      ? Object.keys(selectedLiveStatusPayload).filter((key) => /^ch\d+$/i.test(key))
      : [];
    const fallbackKeys = data?.channelKey ? [data.channelKey] : [];
    return Array.from(new Set([...settingsKeys, ...payloadKeys, ...fallbackKeys]))
      .sort((a, b) => Number(a.replace('ch', '')) - Number(b.replace('ch', '')));
  }, [deviceSettings, selectedLiveStatusPayload, data]);

  const percentages =
    activeShiftPayload?.percentages ||
    calculatePercentages(
      activeShiftPayload?.run_time || 0,
      activeShiftPayload?.shift_time || 0,
      activeShiftPayload?.average || 0,
      activeShiftPayload?.average_threshold || 0,
      activeShiftPayload?.working_time || 0,
      selectedDateObj.format('YY/MM/DD') === dayjs().format('YY/MM/DD')
    );
  const [runPercentage, averagePercentage] = percentages;
  const offtimeV2Result = useMemo(() => {
    const results: OffTimeResult[] = activeOfftimePayload?.results || [];
    return results.find((item: OffTimeResult) => item.channel === channelKey && item.shift === selectedShift) || null;
  }, [activeOfftimePayload, channelKey, selectedShift]);
  const hasOfftimeV2Data = Boolean(offtimeV2Result);

  const thresholdGraphV2Points = useMemo(() => {
    return activeThresholdGraphPayload?.channels?.[channelKey]?.points?.[selectedShift] || [];
  }, [activeThresholdGraphPayload, channelKey, selectedShift]);
  const thresholdGraphV2StartTime = useMemo(() => {
    return activeThresholdGraphPayload?.channels?.[channelKey]?.startTime?.[selectedShift] || null;
  }, [activeThresholdGraphPayload, channelKey, selectedShift]);
  const hasThresholdGraphV2Data = thresholdGraphV2Points.length > 0;
  const filteredOfftimeV2Periods = useMemo(() => {
    if (!offtimeV2Result) {
      return [];
    }

    const allowedStatuses = new Set<string>([
      ...(v2StatusFilters.OFF ? ['OFF'] : []),
      ...(v2StatusFilters.LOW ? ['LOW'] : []),
      ...(v2StatusFilters.OUT ? ['OUT'] : []),
      ...(v2StatusFilters.ON ? ['ON'] : []),
    ]);

    const MAX_DURATION_MINUTES = 24 * 60;

    return [...offtimeV2Result.periods]
      .filter((row) => {
        const minutes = toMinutes(row.timediff);
        const status = String(row.status || '').toUpperCase();

        if (allowedStatuses.has(status)) {
          return minutes >= v2DurationFilterMin && minutes <= MAX_DURATION_MINUTES;
        }

        if (status === 'OUT' && v2StatusFilters.OFF && !v2StatusFilters.OUT && minutes > 25) {
          return minutes >= v2DurationFilterMin && minutes <= MAX_DURATION_MINUTES;
        }

        return false;
      })
      .sort((a, b) => {
        const dateA = dateToTimestamp(a.date);
        const dateB = dateToTimestamp(b.date);
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        return timeToSeconds(a.time) - timeToSeconds(b.time);
      });
  }, [offtimeV2Result, v2StatusFilters, v2DurationFilterMin]);
  const filteredOfftimeV2TotalDuration = useMemo(() => {
    const totalSeconds = filteredOfftimeV2Periods.reduce((sum, item) => {
      return sum + durationToSeconds(item.timediff);
    }, 0);
    return formatDuration(totalSeconds);
  }, [filteredOfftimeV2Periods]);

  useEffect(() => {
    setTableViewMode(hasOfftimeV2Data ? 'v2' : 'legacy');
  }, [hasOfftimeV2Data, showModal, channelKey, selectedShift]);

  useEffect(() => {
    setGraphViewMode(hasThresholdGraphV2Data ? 'v2' : 'legacy');
  }, [hasThresholdGraphV2Data, showModal, channelKey, selectedShift]);

  useEffect(() => {
    const fetchDeviceSettings = async () => {
      if (!showModal || !deviceNo) return;

      try {
        const response = await axios.get(API_HELPERS.getDeviceSettings(deviceNo));
        const settings = response.data.data?.[0];
        setDeviceSettings(settings);

        if (settings && settings[selectedChannelKey] && settings[selectedChannelKey].Name) {
          setMachineName(settings[selectedChannelKey].Name);
        } else {
          setMachineName(`Machine ${selectedChannelKey.toUpperCase()}`);
        }
      } catch (error) {
        console.error('Error fetching device settings:', error);
        setDeviceSettings(null);
        setMachineName(`Machine ${selectedChannelKey.toUpperCase()}`);
      }
    };

    fetchDeviceSettings();
  }, [showModal, deviceNo, selectedChannelKey]);

  useEffect(() => {
    const fetchGraphData = async () => {
      if (!shouldAnalyzeLegacyTable) {
        setIsLoadingGraphData(false);
        setGraphData([]);
        return;
      }

      if (data?.graphDataForModal && data.graphDataForModal.length > 0) {
        setIsLoadingGraphData(false);
        setGraphData(data.graphDataForModal);
        return;
      }

      if (!deviceNo || !channelKey || !convertedDate || !selectedShift) {
        setGraphData([]);
        setIsLoadingGraphData(false);
        return;
      }

      setIsLoadingGraphData(true);
      try {
        const dNo = typeof deviceNo === 'string' ? parseInt(deviceNo, 10) : deviceNo;
        const response = await axios.get(`/api/factory-genie/live-status/device-data`, {
          params: {
            deviceNo: dNo,
            channel: channelKey,
            date: convertedDate,
            shift: selectedShift
          }
        });

        if (response.status === 200 && response.data?.points) {
          setGraphData(Array.isArray(response.data.points) ? response.data.points : []);
        } else {
          setGraphData([]);
        }
      } catch (error) {
        console.error('Error fetching graph data:', error);
        setGraphData([]);
      } finally {
        setIsLoadingGraphData(false);
      }
    };

    fetchGraphData();
  }, [shouldAnalyzeLegacyTable, deviceNo, channelKey, convertedDate, selectedShift, data?.graphDataForModal]);

  function toMinutes(dur: string | undefined) {
    if (!dur) return 0;
    const parts = dur.split(":").map((n: string) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 60 + m + (s ? s / 60 : 0);
    }
    if (parts.length === 2) {
      const [m, s] = parts;
      return m + (s ? s / 60 : 0);
    }
    return 0;
  }

  function dateToTimestamp(dateStr: string | undefined): number {
    if (!dateStr || dateStr === '-') return 0;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    const [year, month, day] = parts.map((n: string) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(parseInt(n, 10)))) return 0;
    const fullYear = year < 100 ? 2000 + year : year;
    const date = new Date(fullYear, month - 1, day);
    return date.getTime();
  }

  function timeToSeconds(timeStr: string | undefined): number {
    if (!timeStr || timeStr === '-') return 0;
    const parts = timeStr.split(":").map((n: string) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + (s || 0);
    }
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + (s || 0);
    }
    return 0;
  }

  const formatTime = (timeStr: string | undefined): string => {
    if (!timeStr || timeStr === '-') return timeStr || '-';
    const parts = timeStr.split(":");
    if (parts.length === 3) {
      const [h, m, s] = parts.map((n: string) => parseInt(n, 10));
      if (parts.some((n) => Number.isNaN(parseInt(n, 10)))) return timeStr;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    if (parts.length === 2) {
      const [m, s] = parts.map((n: string) => parseInt(n, 10));
      if (parts.some((n) => Number.isNaN(parseInt(n, 10)))) return timeStr;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return timeStr;
  };

  function durationToSeconds(dur: string | undefined): number {
    if (!dur || dur === '-') return 0;
    const parts = dur.split(":").map((n: string) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + (s || 0);
    }
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + (s || 0);
    }
    return 0;
  }

  function formatDuration(totalSeconds: number): string {
    if (totalSeconds === 0) return '00:00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  const totalV2Duration = useMemo(() => {
    const totalSeconds = filteredV2TableData.reduce((sum, item) => {
      return sum + durationToSeconds(item.timediff);
    }, 0);
    return formatDuration(totalSeconds);
  }, [filteredV2TableData]);

  const parseDateTime = (dateStr: string, timeStr: string): Date => {
    const [yearStr, monthStr, dayStr] = dateStr.split('/');
    const yearNum = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const dayNum = parseInt(dayStr, 10);
    const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum;

    const timeParts = timeStr.split(':');
    const hours = (timeParts[0] || '0').padStart(2, '0');
    const minutes = timeParts[1] ? timeParts[1].padStart(2, '0') : '00';
    const seconds = timeParts[2] ? timeParts[2].padStart(2, '0') : '00';
    const normalizedTime = `${hours}:${minutes}:${seconds}`;

    const dateString = `${fullYear}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}T${normalizedTime}`;
    return new Date(dateString);
  };

  const getStatusFromValue = (value: number, onThreshold: number | null, lowThreshold: number | null): string => {
    if (onThreshold !== null && value >= onThreshold) {
      return 'ON';
    }
    if (lowThreshold !== null && value >= lowThreshold) {
      return 'LOW';
    }
    return 'OFF';
  };

  const formatTimeHHMMSS = (date: Date): string => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const getStatusStyle = (status: string | undefined): React.CSSProperties => {
    const statusUpper = (status || '').toUpperCase();
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      OFF: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
      LOW: { bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
      ON: { bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
      OUT: { bg: '#e0e7ff', color: '#6366f1', border: '#a5b4fc' },
    };
    const style = styles[statusUpper] || { bg: 'transparent', color: '#000', border: 'transparent' };
    return {
      backgroundColor: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
      padding: '4px 8px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      textTransform: 'uppercase',
      display: 'inline-block',
      minWidth: '50px',
      textAlign: 'center' as const,
    };
  };

  const analyzeGraphData = useMemo(() => {
    const dataToAnalyze = graphData;

    if (!dataToAnalyze.length) {
      return [];
    }

    if (!deviceSettings || !deviceSettings[channelKey]) {
      return [];
    }

    const channelSettings = deviceSettings[channelKey] as Record<string, unknown>;
    const onThreshold = (channelSettings.ON_Threshold as number) || null;
    const lowThreshold = (channelSettings.LOW_Effeciency_Threshold as number) || null;

    type GraphDataItem = {
      date?: string;
      time?: string;
      value?: number;
      datetime?: string;
      [key: string]: unknown;
    };

    const sortedData = [...dataToAnalyze].sort((a: unknown, b: unknown) => {
      const itemA = a as GraphDataItem;
      const itemB = b as GraphDataItem;

      const getDateFromRecord = (item: GraphDataItem): Date => {
        if (item.datetime) {
          const parts = item.datetime.split(' ');
          if (parts.length === 2) {
            return parseDateTime(parts[0], parts[1]);
          }
        }
        return parseDateTime(item.date || currentDate, item.time || '00:00:00');
      };

      const dateA = getDateFromRecord(itemA);
      const dateB = getDateFromRecord(itemB);
      return dateA.getTime() - dateB.getTime();
    });

    if (sortedData.length === 0) return [];

    const periods: OffTimeDataItem[] = [];
    let previousStatus: string | null = null;
    let currentPeriodStart: Date | null = null;
    let currentPeriodStartDate: string = currentDate;
    let currentPeriodStartTime: string = '00:00:00';

    for (let i = 0; i < sortedData.length; i++) {
      const record = sortedData[i] as GraphDataItem;

      let recordValue = 0;
      if (typeof record.value === 'number') {
        recordValue = record.value;
      } else if (typeof record[channelKey] === 'number') {
        recordValue = record[channelKey] as number;
      } else if (typeof record[channelKey] === 'string') {
        recordValue = Number(record[channelKey]) || 0;
      }

      let recordDate = record.date || currentDate;
      let recordTime = record.time || '00:00:00';

      if (record.datetime) {
        const parts = record.datetime.split(' ');
        if (parts.length === 2) {
          recordDate = parts[0];
          recordTime = parts[1];
        }
      }

      const recordDateTime = parseDateTime(recordDate, recordTime);
      const currentStatus = getStatusFromValue(recordValue, onThreshold, lowThreshold);

      if (i === 0) {
        previousStatus = currentStatus;
        currentPeriodStart = recordDateTime;
        currentPeriodStartDate = recordDate;
        currentPeriodStartTime = recordTime;
        continue;
      }

      const previousRecord = sortedData[i - 1] as GraphDataItem;
      let prevRecordDate = previousRecord.date || currentDate;
      let prevRecordTime = previousRecord.time || '00:00:00';
      if (previousRecord.datetime) {
        const parts = previousRecord.datetime.split(' ');
        if (parts.length === 2) {
          prevRecordDate = parts[0];
          prevRecordTime = parts[1];
        }
      }
      const prevRecordDateTime = parseDateTime(prevRecordDate, prevRecordTime);
      const timeGap = recordDateTime.getTime() - prevRecordDateTime.getTime();
      const gapMinutes = timeGap / (1000 * 60);
      const GAP_THRESHOLD_MINUTES = 3;

      if (gapMinutes > GAP_THRESHOLD_MINUTES) {
        if (previousStatus !== null && currentPeriodStart !== null) {
          const periodEnd = prevRecordDateTime;
          const periodDuration = periodEnd.getTime() - currentPeriodStart.getTime();

          if (periodDuration > 0) {
            periods.push({
              date: currentPeriodStartDate,
              time: currentPeriodStartTime,
              status: previousStatus,
              endtime: formatTimeHHMMSS(periodEnd),
              timediff: formatDuration(Math.floor(periodDuration / 1000))
            });
          }
        }

        const gapDuration = recordDateTime.getTime() - prevRecordDateTime.getTime();
        if (gapDuration > 0) {
          periods.push({
            date: prevRecordDate,
            time: prevRecordTime,
            status: 'OUT',
            endtime: formatTimeHHMMSS(recordDateTime),
            timediff: formatDuration(Math.floor(gapDuration / 1000))
          });
        }

        currentPeriodStart = recordDateTime;
        currentPeriodStartDate = recordDate;
        currentPeriodStartTime = recordTime;
        previousStatus = currentStatus;
        continue;
      }

      if (currentStatus !== previousStatus && previousStatus !== null && currentPeriodStart !== null) {
        const periodEnd = recordDateTime;
        const periodDuration = periodEnd.getTime() - currentPeriodStart.getTime();

        if (periodDuration > 0) {
          periods.push({
            date: currentPeriodStartDate,
            time: currentPeriodStartTime,
            status: previousStatus,
            endtime: formatTimeHHMMSS(periodEnd),
            timediff: formatDuration(Math.floor(periodDuration / 1000))
          });
        }

        currentPeriodStart = recordDateTime;
        currentPeriodStartDate = recordDate;
        currentPeriodStartTime = recordTime;
      }

      previousStatus = currentStatus;
    }

    if (currentPeriodStart !== null && previousStatus !== null && sortedData.length > 0) {
      const lastRecord = sortedData[sortedData.length - 1] as GraphDataItem;
      let lastDate = lastRecord.date || currentDate;
      let lastTime = lastRecord.time || '00:00:00';

      if (lastRecord.datetime) {
        const parts = lastRecord.datetime.split(' ');
        if (parts.length === 2) {
          lastDate = parts[0];
          lastTime = parts[1];
        }
      }

      const lastDateTime = parseDateTime(lastDate, lastTime);
      const lastDuration = lastDateTime.getTime() - currentPeriodStart.getTime();

      if (lastDuration > 0) {
        periods.push({
          date: currentPeriodStartDate,
          time: currentPeriodStartTime,
          status: previousStatus,
          endtime: formatTimeHHMMSS(lastDateTime),
          timediff: formatDuration(Math.floor(lastDuration / 1000))
        });
      }
    }

    return periods;
  }, [graphData, deviceSettings, channelKey, currentDate]);

  useEffect(() => {
    setV2TableData(analyzeGraphData);
  }, [analyzeGraphData]);

  useEffect(() => {
    const allowedStatuses = new Set<string>([
      ...(v2StatusFilters.OFF ? ['OFF'] : []),
      ...(v2StatusFilters.LOW ? ['LOW'] : []),
      ...(v2StatusFilters.OUT ? ['OUT'] : []),
      ...(v2StatusFilters.ON ? ['ON'] : []),
    ]);
    const filtered = v2TableData.filter((row) => {
      const minutes = toMinutes(row.timediff);
      const status = String(row.status || '').toUpperCase();
      const MAX_DURATION_MINUTES = 24 * 60;

      if (allowedStatuses.has(status)) {
        return minutes >= v2DurationFilterMin && minutes <= MAX_DURATION_MINUTES;
      }

      if (status === 'OUT' && v2StatusFilters.OFF && !v2StatusFilters.OUT && minutes > 25) {
        return minutes >= v2DurationFilterMin && minutes <= MAX_DURATION_MINUTES;
      }

      return false;
    });
    const sorted = filtered.sort((a, b) => {
      const dateA = dateToTimestamp(a.date);
      const dateB = dateToTimestamp(b.date);
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      const timeA = timeToSeconds(a.time);
      const timeB = timeToSeconds(b.time);
      return timeA - timeB;
    });
    setFilteredV2TableData(sorted);
  }, [v2TableData, v2DurationFilterMin, v2StatusFilters]);

  if (!showModal || !data) return null;

  const selectedChannelSettings = deviceSettings?.[channelKey] as Record<string, unknown> | undefined;
  const channelConfig = selectedChannelSettings
    ? { ...selectedChannelSettings, _id: (deviceSettings as Record<string, unknown>)._id, deviceNo }
    : null;

  const handleEnterFullScreen = () => {
    setIsFullScreen(true);
  };

  const handleExitFullScreen = () => {
    setIsFullScreen(false);
  };

  const handleClose = () => {
    setIsFullScreen(false);
    onClose();
  };

  return (
    <div className={`overlay ${isFullScreen ? 'fullScreenOverlay' : ''}`}>
      <div className={`modal ${isFullScreen ? 'fullScreenModal' : ''}`}>
        <div className="modalHeader">
          <h2>Shift Data Details</h2>

          <div className="buttonsGroup">
            {!isFullScreen ? (
              <button
                className="fullScreenBtn"
                onClick={handleEnterFullScreen}
                aria-label="Enter Full Screen"
                title="Expand to Fullscreen"
              >
                ⤢
              </button>
            ) : (
              <button
                className="closeFullScreenBtn"
                onClick={handleExitFullScreen}
                aria-label="Exit Full Screen"
                title="Exit Fullscreen"
              >
                ⤡
              </button>
            )}

            <button className="closeButton" onClick={handleClose} aria-label="Close Modal">
              ×
            </button>
          </div>
        </div>

        <div className={`scrollableContent ${isFullScreen ? 'fullScreenScrollable' : ''}`}>
          <div className="tabSelector">
            <button
              className={activeTab === 'table' ? 'active' : ''}
              onClick={() => setActiveTab('table')}
            >
              📋 Off Time Table
            </button>
            <button
              className={activeTab === 'graph' ? 'active' : ''}
              onClick={() => setActiveTab('graph')}
            >
              📊 Current Graph
            </button>
          </div>

          <div className="dataSection">
            <div className="infoCard">
              <span className="infoLabel">Machine:</span>
              <span className="infoValue">
                {isEditingMachine ? (
                  <select
                    autoFocus
                    value={selectedChannelKey}
                    onChange={(e) => {
                      setSelectedChannelKey(e.target.value);
                      setIsEditingMachine(false);
                    }}
                    onBlur={() => setIsEditingMachine(false)}
                    style={{ minWidth: '180px', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 8px' }}
                  >
                    {availableChannelKeys.map((key) => (
                      <option key={key} value={key}>
                        {(deviceSettings?.[key] as Record<string, unknown> | undefined)?.Name as string || selectedLiveStatusPayload?.[key]?.channel_name || key.toUpperCase()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingMachine(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      font: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    {machineName}
                  </button>
                )}
              </span>
            </div>
            <div className="infoCard">
              <span className="infoLabel">Date & Shift:</span>
              <span className="infoValue" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {isEditingDateShift ? (
                  <>
                    <DatePicker
                      autoFocus
                      value={selectedDateObj}
                      onChange={(value) => {
                        if (value) {
                          setSelectedDateObj(value);
                        }
                      }}
                      format="YY/M/D"
                      allowClear={false}
                      onBlur={() => setIsEditingDateShift(false)}
                    />
                    <select
                      value={selectedShiftValue}
                      onChange={(e) => {
                        setSelectedShiftValue(e.target.value);
                        setIsEditingDateShift(false);
                      }}
                      onBlur={() => setIsEditingDateShift(false)}
                      style={{ minWidth: '120px', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 8px' }}
                    >
                      <option value="morning">Morning</option>
                      <option value="night">Night</option>
                    </select>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingDateShift(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      font: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    {formattedDateWithShift}
                  </button>
                )}
              </span>
            </div>
          </div>

          <div className="contentArea">
            {activeTab === 'table' && tableViewMode === 'legacy' ? (
              <div className="tableSection">
                <h3>📋 Off Time Details</h3>
                {hasOfftimeV2Data && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setTableViewMode('legacy')}
                      style={{ backgroundColor: '#111827', color: '#fff' }}
                    >
                      Detailed
                    </button>
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setTableViewMode('v2')}
                    >
                      Rounded
                    </button>
                  </div>
                )}
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Min Duration:</label>
                    <select
                      value={v2DurationFilterMin}
                      onChange={(e) => setV2DurationFilterMin(parseInt(e.target.value, 10))}
                      className="rounded border border-stroke px-2 py-1 text-sm dark:border-strokedark"
                    >
                      <option value={1}>1 min</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.OFF}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, OFF: e.target.checked }))}
                      />
                      OFF
                    </label>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.LOW}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, LOW: e.target.checked }))}
                      />
                      LOW
                    </label>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.OUT}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, OUT: e.target.checked }))}
                      />
                      OUT
                    </label>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.ON}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, ON: e.target.checked }))}
                      />
                      ON
                    </label>
                  </div>
                </div>
                {isLoadingGraphData ? (
                  <div className="loadingState">
                    <div className="loadingSpinner"></div>
                    <p>Loading graph data and analyzing off-time periods...</p>
                  </div>
                ) : filteredV2TableData.length > 0 ? (
                  <div className="tableWrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Start Time</th>
                          <th>Status</th>
                          <th>End Time</th>
                          <th>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredV2TableData.map((item: OffTimeDataItem, index: number) => (
                          <tr key={index}>
                            <td>{item.date}</td>
                            <td style={{ paddingLeft: '20px', paddingRight: '20px' }}>{formatTime(item.time)}</td>
                            <td>
                              <span
                                className={`status-badge status-${item.status?.toLowerCase() || ''}`}
                                style={getStatusStyle(item.status)}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td style={{ paddingLeft: '20px', paddingRight: '20px' }}>{formatTime(item.endtime)}</td>
                            <td>{item.timediff}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'right' }}>
                            Total Duration:
                          </td>
                          <td>
                            {totalV2Duration}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="emptyState">
                    <p>📄 No off-time data available from graph analysis for this machine and shift.</p>
                    {v2TableData.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        Found {v2TableData.length} periods, but none match the current filters.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : activeTab === 'table' ? (
              <div className="tableSection">
                <h3>📋 Off Time Details V2</h3>
                {hasOfftimeV2Data && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setTableViewMode('legacy')}
                    >
                      Detailed
                    </button>
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setTableViewMode('v2')}
                      style={{ backgroundColor: '#111827', color: '#fff' }}
                    >
                      Rounded
                    </button>
                  </div>
                )}
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Min Duration:</label>
                    <select
                      value={v2DurationFilterMin}
                      onChange={(e) => setV2DurationFilterMin(parseInt(e.target.value, 10))}
                      className="rounded border border-stroke px-2 py-1 text-sm dark:border-strokedark"
                    >
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.OFF}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, OFF: e.target.checked }))}
                      />
                      OFF
                    </label>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.LOW}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, LOW: e.target.checked }))}
                      />
                      LOW
                    </label>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={v2StatusFilters.OUT}
                        onChange={(e) => setV2StatusFilters((s) => ({ ...s, OUT: e.target.checked }))}
                      />
                      OUT
                    </label>
                  </div>
                </div>
                {isLoadingSelectedPayload ? (
                  <div className="loadingState">
                    <div className="loadingSpinner"></div>
                    <p>Loading rounded view data...</p>
                  </div>
                ) : offtimeV2Result ? (
                  <>
                    {filteredOfftimeV2Periods.length > 0 ? (
                      <div className="tableWrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Start Time</th>
                              <th>Status</th>
                              <th>End Time</th>
                              <th>Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredOfftimeV2Periods.map((item: OffTimeDataItem, index: number) => (
                              <tr key={index}>
                                <td>{item.date}</td>
                                <td style={{ paddingLeft: '20px', paddingRight: '20px' }}>{formatTime(item.time)}</td>
                                <td>
                                  <span
                                    className={`status-badge status-${item.status?.toLowerCase() || ''}`}
                                    style={getStatusStyle(item.status)}
                                  >
                                    {item.status}
                                  </span>
                                </td>
                                <td style={{ paddingLeft: '20px', paddingRight: '20px' }}>{formatTime(item.endtime)}</td>
                                <td>{item.timediff}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'right' }}>
                                Total Duration:
                              </td>
                              <td>{filteredOfftimeV2TotalDuration}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="emptyState">
                        <p>📄 No off-time data available from `offtime.results` for this machine and shift.</p>
                        {offtimeV2Result.periods.length > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            Found {offtimeV2Result.periods.length} periods, but none match the current filters.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="emptyState">
                    <p>📄 No `offtime` payload is available for this machine, channel, and shift.</p>
                  </div>
                )}
              </div>
            ) : activeTab === 'graph' && graphViewMode === 'legacy' ? (
              <div className="graphSection">
                {hasThresholdGraphV2Data && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setGraphViewMode('legacy')}
                      style={{ backgroundColor: '#111827', color: '#fff' }}
                    >
                      Detailed
                    </button>
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setGraphViewMode('v2')}
                    >
                      Rounded
                    </button>
                  </div>
                )}
                {channelConfig ? (
                  <ThresholdGraph
                    deviceNo={deviceNo}
                    channelKey={channelKey}
                    dateShift={formattedDateWithShift}
                    backendSetting={channelConfig}
                    preloadedGraphData={data.graphDataForModal || []}
                    preloadedStartTime={null}
                    onSettingsChange={() => {}}
                  />
                ) : (
                  <div className="loadingState">
                    <div className="loadingSpinner"></div>
                    <p>Loading threshold settings...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="graphSection">
                {hasThresholdGraphV2Data && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setGraphViewMode('legacy')}
                    >
                      Detailed
                    </button>
                    <button
                      type="button"
                      className="rounded border border-stroke px-3 py-1 text-sm"
                      onClick={() => setGraphViewMode('v2')}
                      style={{ backgroundColor: '#111827', color: '#fff' }}
                    >
                      Rounded
                    </button>
                  </div>
                )}
                {channelConfig ? (
                  <ThresholdGraph
                    deviceNo={deviceNo}
                    channelKey={channelKey}
                    dateShift={formattedDateWithShift}
                    backendSetting={channelConfig}
                    preloadedGraphData={thresholdGraphV2Points}
                    preloadedStartTime={thresholdGraphV2StartTime}
                    onSettingsChange={() => {}}
                  />
                ) : thresholdGraphV2Points.length > 0 ? (
                  <ThresholdGraph
                    deviceNo={deviceNo}
                    channelKey={channelKey}
                    dateShift={formattedDateWithShift}
                    backendSetting={{}}
                    preloadedGraphData={thresholdGraphV2Points}
                    preloadedStartTime={thresholdGraphV2StartTime}
                    onSettingsChange={() => {}}
                  />
                ) : (
                  <div className="emptyState">
                    <p>📄 No `threshold graph` payload is available for this machine, channel, and shift.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="efficiencySection">
            <div className="efficiencyCard">
              <span className="efficiencyLabel">⏱️ Run Time</span>
              <span className="efficiencyValue">{runPercentage.toFixed(1)}%</span>
            </div>
            <div className="efficiencyCard">
              <span className="efficiencyLabel">⚡ Runtime Load</span>
              <span className="efficiencyValue">{averagePercentage.toFixed(1)}%</span>
            </div>
            <div className="efficiencyCard">
              <span className="efficiencyLabel">🎯 Overall</span>
              <span className="efficiencyValue">{((averagePercentage * runPercentage) / 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataModal;
