/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import dynamic from 'next/dynamic';
import React, { useEffect, useRef, useState } from 'react';
import { DatePicker, Spin } from 'antd';
import BarChartPlaceholder from './Components/BarChartPlaceholder';
import './DashBoard.css';
import CircularProgress from './Components/Progress';
import dayjs from 'dayjs';

const DataModal = dynamic(() => import('./DataModal'));

const CHANNEL_KEY_PATTERN = /^ch(\d+)$/i;
const STATUS_KEY_PATTERN = /^ch\d+_status$/i;
const LIVE_STATUS_SOURCES = ['factory-genie-live-status', 'cnc'] as const;
const LIVE_STATUS_CACHE_DISABLED_KEY = "factory-genie-live-status-cache-disabled";
type ShiftFilter = 'all' | 'morning' | 'night';

const getChannelNumber = (channelKey: string) => {
  const match = channelKey.match(CHANNEL_KEY_PATTERN);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const getDisplaySequenceValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getWorkingTimeScore = (device: any) => {
  if (!device || typeof device !== 'object') {
    return 0;
  }

  return Object.entries(device).reduce((deviceTotal, [key, value]) => {
    if (!CHANNEL_KEY_PATTERN.test(key) || !value || typeof value !== 'object') {
      return deviceTotal;
    }

    const channelTotal = ['morning', 'night'].reduce((shiftTotal, shift) => {
      const shiftValue = (value as Record<string, any>)[shift];
      if (!shiftValue || typeof shiftValue !== 'object') {
        return shiftTotal;
      }

      const workingTime = shiftValue.working_time;
      if (typeof workingTime === 'number' && Number.isFinite(workingTime)) {
        return shiftTotal + workingTime;
      }

      if (typeof workingTime === 'string' && workingTime.trim() !== '') {
        const parsed = Number(workingTime);
        return shiftTotal + (Number.isFinite(parsed) ? parsed : 0);
      }

      return shiftTotal;
    }, 0);

    return deviceTotal + channelTotal;
  }, 0);
};

const pickBetterDeviceData = (existingDevice: any, candidateDevice: any) => {
  if (!existingDevice) {
    return candidateDevice;
  }

  return getWorkingTimeScore(candidateDevice) > getWorkingTimeScore(existingDevice)
    ? candidateDevice
    : existingDevice;
};

function App() {
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [shiftData, setShiftData] = useState<any[]>([]);
  const [todayData, setTodayData] = useState<any[]>([]);
  const [selectedDateObj, setSelectedDateObj] = useState(dayjs());
  const [selectedShift, setSelectedShift] = useState<ShiftFilter>('morning');
  const [showModal, setShowModal] = useState(false);
  const [latestStatusData, setLatestStatusData] = useState<any>({});
  const [deviceSettingsMap, setDeviceSettingsMap] = useState<Record<number, Record<string, any>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hideLoadEfficiency, setHideLoadEfficiency] = useState(false);
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [cacheDisabled, setCacheDisabled] = useState(false);
  const fetchRequestIdRef = useRef(0);

  const handleShowModal = () => setShowModal(true);
  const handleCloseModal = () => setShowModal(false);

  useEffect(() => {
    try {
      const rawUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      let nextDeviceNumbers: number[] = [];

      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed.deviceNo) {
          if (Array.isArray(parsed.deviceNo) && parsed.deviceNo.length > 0) {
            nextDeviceNumbers = parsed.deviceNo;
          } else if (typeof parsed.deviceNo === "number") {
            nextDeviceNumbers = [parsed.deviceNo];
          }
        }
      }

      const direct = typeof window !== "undefined" ? localStorage.getItem("deviceNo") : null;
      if (direct) {
        const directDevices = direct.split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d));
        if (directDevices.length > 0) {
          nextDeviceNumbers = directDevices;
        }
      }

      if (typeof window !== "undefined") {
        setCacheDisabled(localStorage.getItem(LIVE_STATUS_CACHE_DISABLED_KEY) === "true");
        const oldCacheKeys = [
          'shiftData_17_12_26_70',
          'offTimeData_17_12_26_70',
          'lastFetch_17_12_26_70',
          'shiftData_17',
          'offTimeData_17',
          'lastFetch_17',
          'shiftData_12',
          'offTimeData_12',
          'lastFetch_12',
          'shiftData_26',
          'offTimeData_26',
          'lastFetch_26',
          'shiftData_70',
          'offTimeData_70',
          'lastFetch_70'
        ];
        oldCacheKeys.forEach((key) => {
          localStorage.removeItem(key);
        });

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('17') || key.includes('12') || key.includes('26') || key.includes('70'))) {
            if (key.startsWith('shiftData_') || key.startsWith('offTimeData_') || key.startsWith('lastFetch_')) {
              localStorage.removeItem(key);
            }
          }
        }
      }

      if (nextDeviceNumbers.length === 0) {
        console.warn('No device numbers found, this might cause issues');
      } else {
        setDeviceNumbers(nextDeviceNumbers);
      }
    } catch {
      console.log('Error loading device numbers, using empty array');
      setDeviceNumbers([]);
    }
  }, []);

  const CACHE_KEYS = {
    SHIFT_DATA: `shiftData_${deviceNumbers.join('_')}`,
    LAST_FETCH: `lastFetch_${deviceNumbers.join('_')}`,
    CACHE_DURATION: 5 * 60 * 1000
  };

  const saveToLocalStorage = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  const getFromLocalStorage = (key: string) => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const { data, timestamp } = JSON.parse(stored);
      const now = Date.now();

      if (now - timestamp < CACHE_KEYS.CACHE_DURATION) {
        return data;
      }

      localStorage.removeItem(key);
      return null;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return null;
    }
  };

  const getShiftTimeInHours = (shift_time: string | number) => {
    if (typeof shift_time === 'string') {
      const [hours, minutes, seconds] = shift_time.split(':').map(Number);
      return hours * 60 + minutes + (seconds ? seconds / 60 : 0);
    }
    if (typeof shift_time === 'number') {
      return shift_time;
    }
    return 0;
  };

  const calculatePercentages = (
    run_time: number,
    shift_time: number,
    average: number,
    average_threshold: number,
    working_time?: number,
    isToday?: boolean
  ) => {
    let baseTime = shift_time;
    if (isToday && working_time && working_time > 0) {
      baseTime = working_time;
    }

    let runPercentage = baseTime > 0 ? (run_time / baseTime) * 100 : 0;
    runPercentage = Math.min(runPercentage, 100);

    let averagePercentage = average_threshold > 0 ? (average / average_threshold) * 100 : 0;
    averagePercentage = Math.min(averagePercentage, 150);

    return [runPercentage, averagePercentage];
  };

  const getOrderedChannelKeys = (deviceNo: number, channels: Record<string, any>) => {
    const deviceSettings = deviceSettingsMap[deviceNo] || {};

    return Object.keys(channels).sort((a, b) => {
      const aSequence = getDisplaySequenceValue(deviceSettings[a]?.Display_Sequence);
      const bSequence = getDisplaySequenceValue(deviceSettings[b]?.Display_Sequence);

      if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
        return aSequence - bSequence;
      }
      if (aSequence !== null && bSequence === null) {
        return -1;
      }
      if (aSequence === null && bSequence !== null) {
        return 1;
      }

      return getChannelNumber(a) - getChannelNumber(b);
    });
  };

  const processShiftData = (data: any[]) => {
    const sortedData = data.sort((a: any, b: any) => a.deviceno - b.deviceno);

    return sortedData.map((device: any) => {
      const channels: any = {};

      for (const key in device) {
        if (key.startsWith('ch')) {
          const channel = device[key];
          channels[key] = {
            channel_name: channel.channel_name || `Channel ${key}`
          };

          ['morning', 'night'].forEach((shift: string) => {
            if (channel[shift]) {
              const shiftTimeInHours = getShiftTimeInHours(channel[shift].shift_time);
              channels[key][shift] = {
                run_time: channel[shift].run_time,
                shift_time: shiftTimeInHours,
                average: channel[shift].average,
                average_threshold: channel[shift].average_threshold,
                working_time: channel[shift].working_time,
                value_sum: channel[shift].value_sum,
                setup_changes: channel[shift].setup_changes,
                setup_time: channel[shift].setup_time,
                percentages: calculatePercentages(
                  channel[shift].run_time,
                  shiftTimeInHours,
                  channel[shift].average,
                  channel[shift].average_threshold,
                  channel[shift].working_time,
                  selectedDateObj.format('YY/MM/DD') === dayjs().format('YY/MM/DD')
                )
              };
            }
          });
        }
      }

      return {
        deviceNo: device.deviceno,
        channels,
        currentdate: device.currentdate,
        morning: device.morning,
        night: device.night,
        offtime: device.offtime || null,
        thresholdGraph: device.thresholdGraph || device["threshold graph"] || null
      };
    });
  };

  const getColor = (percentage: number) => {
    if (percentage < 100) return '#f94144';
    if (percentage < 0) return '#f9844a';
    return '#43aa8b';
  };

  const getChannelStatusColor = (deviceNo: number, channelKey: string) => {
    const deviceStatus = latestStatusData[deviceNo];
    if (!deviceStatus) return null;
    const statusKey = `${channelKey}_status`;
    const status = deviceStatus[statusKey];
    if (status === 'ON') return '#43aa8b';
    if (status === 'OFF') return '#f94144';
    if (status === 'LOW') return '#f8961e';
    return null;
  };

  const fetchData = async (forceRefresh = false, selectedDate?: any) => {
    try {
      const dateToUse = selectedDate || selectedDateObj;
      const formattedDate = dateToUse.format('YY/MM/DD');
      const requestId = ++fetchRequestIdRef.current;
      let hasRenderedResponse = false;

      if (!cacheDisabled && !forceRefresh && !selectedDate) {
        const cachedShiftData = getFromLocalStorage(CACHE_KEYS.SHIFT_DATA);
        if (cachedShiftData && cachedShiftData.length > 0) {
          setShiftData(cachedShiftData);
          filterData(cachedShiftData, dateToUse);
          setIsLoading(false);
          hasRenderedResponse = true;
        }
      }

      if (deviceNumbers.length === 0) {
        setIsLoading(false);
        return;
      }

      if (!hasRenderedResponse) {
        setIsLoading(true);
      }

      const mergedDocsByDevice = new Map<number, any>();

      const applyDocs = (docs: any[]) => {
        docs.forEach((doc) => {
          if (typeof doc?.deviceno !== 'number') {
            return;
          }

          mergedDocsByDevice.set(
            doc.deviceno,
            pickBetterDeviceData(mergedDocsByDevice.get(doc.deviceno), doc)
          );
        });

        const nextData = deviceNumbers
          .map((deviceNo) => mergedDocsByDevice.get(deviceNo))
          .filter(Boolean);

        setShiftData(nextData);
        filterData(nextData, dateToUse);

        if (!selectedDate && !cacheDisabled) {
          saveToLocalStorage(CACHE_KEYS.SHIFT_DATA, nextData);
        }
      };

      const promises = LIVE_STATUS_SOURCES.map(async (source) => {
        try {
          const response = await fetch(
            `/api/factory-genie/live-status?date=${formattedDate}&deviceNo=${deviceNumbers.join(',')}&source=${source}&bypassCache=${cacheDisabled ? '1' : '0'}`,
            { cache: 'no-store' }
          );

          if (response.ok) {
            const result = await response.json();
            if (fetchRequestIdRef.current !== requestId) {
              return;
            }

            applyDocs(Array.isArray(result.data) ? result.data : []);
            if (!hasRenderedResponse) {
              hasRenderedResponse = true;
              setIsLoading(false);
            }
          }
        } catch {
          return;
        }
      });

      await Promise.allSettled(promises);

      if (fetchRequestIdRef.current !== requestId) {
        return;
      }

      if (!hasRenderedResponse) {
        setShiftData([]);
        filterData([], dateToUse);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching initial data', error);
      setIsLoading(false);
    }
  };

  const fetchLatestStatusData = async () => {
    if (deviceNumbers.length === 0) return;

    try {
      const formattedDate = selectedDateObj.format('YY/MM/DD');
      const statusByDevice: any = {};

      const promises = deviceNumbers.map(async (deviceNo) => {
        try {
          const response = await fetch(`/api/factory-genie/live-status/device-status?date=${formattedDate}&deviceNo=${deviceNo}`);
          if (response.ok) {
            const result = await response.json();
            const statusData = result.data;
            if (statusData) {
              const dynamicStatus = Object.entries(statusData).reduce((acc: Record<string, any>, [key, value]) => {
                if (STATUS_KEY_PATTERN.test(key)) {
                  acc[key] = value;
                }
                return acc;
              }, {});

              return {
                deviceNo,
                status: dynamicStatus
              };
            }
          }
          return null;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(promises);
      results.forEach((result) => {
        if (result) {
          statusByDevice[result.deviceNo] = result.status;
        }
      });

      setLatestStatusData(statusByDevice);
    } catch (error) {
      console.error('Error fetching latest status data', error);
      setLatestStatusData({});
    }
  };

  const fetchDeviceSettings = async () => {
    if (deviceNumbers.length === 0) return;

    try {
      const settingsResponses = await Promise.all(
        deviceNumbers.map(async (deviceNo) => {
          try {
            const response = await fetch(`/api/factory-genie/live-status/device-settings/${deviceNo}`, { cache: "no-store" });
            if (!response.ok) {
              return null;
            }

            const json = await response.json();
            const data = Array.isArray(json.data) ? json.data[0] || null : null;
            return data ? { deviceNo, data } : null;
          } catch {
            return null;
          }
        })
      );

      const nextSettingsMap: Record<number, Record<string, any>> = {};
      settingsResponses.forEach((entry) => {
        if (entry) {
          nextSettingsMap[entry.deviceNo] = entry.data;
        }
      });
      setDeviceSettingsMap(nextSettingsMap);
    } catch (error) {
      console.error('Error fetching device settings', error);
      setDeviceSettingsMap({});
    }
  };

  const filterData = (data: any, selectedDate: any) => {
    const formattedDate = selectedDate.format('YY/MM/DD');
    const filtered = data.filter((item: any) => item.currentdate === formattedDate);
    const processed = processShiftData(filtered);
    setTodayData(processed);
  };

  const refreshData = () => {
    localStorage.removeItem(CACHE_KEYS.SHIFT_DATA);
    fetchDeviceSettings();
    fetchData(true, selectedDateObj);
    fetchLatestStatusData();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LIVE_STATUS_CACHE_DISABLED_KEY, cacheDisabled ? "true" : "false");
    if (cacheDisabled) {
      localStorage.removeItem(CACHE_KEYS.SHIFT_DATA);
    }
  }, [CACHE_KEYS.SHIFT_DATA, cacheDisabled]);

  useEffect(() => {
    if (deviceNumbers.length > 0) {
      fetchDeviceSettings();
      fetchData();
      fetchLatestStatusData();
    }
  }, [deviceNumbers]);

  useEffect(() => {
    if (deviceNumbers.length > 0) {
      const dataInterval = setInterval(() => {
        fetchLatestStatusData();
      }, 10000);

      return () => clearInterval(dataInterval);
    }
  }, [deviceNumbers]);

  useEffect(() => {
    if (deviceNumbers.length > 0) {
      fetchDeviceSettings();
      fetchData(false, selectedDateObj);
      fetchLatestStatusData();
    }
  }, [selectedDateObj, deviceNumbers]);

  const showModals = (deviceData: any, currentShiftData: any, channelKey: any, shift: any) => {
    const currentDate = selectedDateObj.format('YY/MM/DD');

    setSelectedMachine({
      ...currentShiftData,
      channelKey,
      shift,
      deviceNo: deviceData.deviceNo,
      currentDate,
      selectedShift: shift,
      graphDataForModal: [],
      offtime: deviceData.offtime || null,
      thresholdGraph: deviceData.thresholdGraph || null
    });
    handleShowModal();
  };

  const formatMinutesToHHMM = (timeInMinutes: any) => {
    const hours = Math.floor(timeInMinutes / 60);
    const minutes = timeInMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  return (
    <div className="App dashboard-page">
      <div className="dashboard-container">
        <div className="main-content">
          <Header
            selectedDateObj={selectedDateObj}
            setSelectedDateObj={setSelectedDateObj}
            selectedShift={selectedShift}
            setSelectedShift={setSelectedShift}
            onRefresh={refreshData}
            hideLoadEfficiency={hideLoadEfficiency}
            setHideLoadEfficiency={setHideLoadEfficiency}
            cacheDisabled={cacheDisabled}
            setCacheDisabled={setCacheDisabled}
          />

          {isLoading ? (
            <div className="content-loader">
              <Spin size="large" />
              <p>Loading dashboard data...</p>
            </div>
          ) : (
            <>
              <div className="progress-section">
                {todayData?.map((device, deviceIndex) => (
                  <div key={deviceIndex} className="device-section">
                    <div className="channel-container">
                      {getOrderedChannelKeys(device.deviceNo, device.channels).map((channelKey) => {
                        const statusColor = getChannelStatusColor(device.deviceNo, channelKey);
                        return (
                          <div key={channelKey} className="channel-section">
                            <h3>{device.channels[channelKey]?.channel_name || `${channelKey}`}</h3>
                            {['morning', 'night'].map((shift) => {
                              const currentShiftData = device.channels[channelKey][shift];
                              if (!currentShiftData || (selectedShift !== 'all' && shift !== selectedShift)) return null;

                              const [runPercentage, averagePercentage] = currentShiftData.percentages;
                              const averagePercentageForOEE = Math.min(averagePercentage, 100);

                              const oeeValue = hideLoadEfficiency
                                ? runPercentage
                                : ((averagePercentageForOEE * runPercentage) / 100);

                              const dialPercentages = hideLoadEfficiency
                                ? [runPercentage]
                                : [runPercentage, averagePercentageForOEE];

                              return (
                                <div
                                  key={shift}
                                  className="shift-section"
                                  onClick={() => showModals(device, currentShiftData, channelKey, shift)}
                                  style={statusColor ? { backgroundColor: `${statusColor}20` } : {}}
                                >
                                  <h4>{shift.charAt(0).toUpperCase() + shift.slice(1)} Shift</h4>
                                  <CircularProgress
                                    size={150}
                                    strokeWidth={10}
                                    percentages={dialPercentages}
                                    colors={hideLoadEfficiency ? [getColor(runPercentage)] : [getColor(runPercentage), "#f8961e"]}
                                  />
                                  <p><strong>Shift Duration:</strong> {formatMinutesToHHMM(currentShiftData.shift_time)}/{formatMinutesToHHMM(currentShiftData.working_time || 0)}</p>
                                  <p><strong>Run Time:</strong> {formatMinutesToHHMM(currentShiftData.run_time)} ({runPercentage.toFixed(2)}%)</p>
                                  {!hideLoadEfficiency && (
                                    <p><strong>Runtime Load:</strong> {averagePercentage.toFixed(2)}%</p>
                                  )}
                                  <p><strong>OEE:</strong> {oeeValue.toFixed(2)}%</p>
                                  {currentShiftData.setup_changes > 0 && (
                                    <p><strong>Setup Changes:</strong> {currentShiftData.setup_changes}</p>
                                  )}
                                  {currentShiftData.setup_time > 0 && (
                                    <p><strong>Setup Time:</strong> {formatMinutesToHHMM(currentShiftData.setup_time)}</p>
                                  )}
                                  {latestStatusData[device.deviceNo] && latestStatusData[device.deviceNo][`${channelKey}_status`] && (
                                    <p><strong>Current Status:</strong> {latestStatusData[device.deviceNo][`${channelKey}_status`]}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bar-chart-section">
                {shiftData && shiftData.length > 0 ? (
                  <BarChartPlaceholder
                    shiftwiseData={shiftData}
                    selectedDate={selectedDateObj.format('YY/MM/DD')}
                    selectedShift={selectedShift}
                    deviceSettingsMap={deviceSettingsMap}
                  />
                ) : (
                  <p>No shift data available</p>
                )}
              </div>
            </>
          )}
        </div>

        <DataModal
          showModal={showModal}
          onClose={handleCloseModal}
          data={selectedMachine}
        />
      </div>
    </div>
  );
}

const Header = ({
  selectedDateObj,
  setSelectedDateObj,
  selectedShift,
  setSelectedShift,
  onRefresh,
  hideLoadEfficiency,
  setHideLoadEfficiency,
  cacheDisabled,
  setCacheDisabled
}: {
  selectedDateObj: any;
  setSelectedDateObj: any;
  selectedShift: ShiftFilter;
  setSelectedShift: React.Dispatch<React.SetStateAction<ShiftFilter>>;
  onRefresh: any;
  hideLoadEfficiency: boolean;
  setHideLoadEfficiency: (value: boolean) => void;
  cacheDisabled: boolean;
  setCacheDisabled: (value: boolean) => void;
}) => {
  const [userName, setUserName] = useState('User');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('user');
      if (rawUser) {
        const user = JSON.parse(rawUser);
        setIsAdmin(user?.role === 'admin');
        if (user.firstName && user.lastName) {
          setUserName(`${user.firstName} ${user.lastName}`);
        } else if (user.firstName) {
          setUserName(user.firstName);
        }
      }
    } catch (error) {
      console.error('Error reading user from localStorage:', error);
    }
  }, []);

  return (
    <header className="dashboard-header">
      <div className="header-main">
        <h1>
          <span>Welcome Back,</span>
          <span className="dashboard-user-name">{userName}</span>
        </h1>
      </div>

      <div className="header-controls">
        <div className="date-controls">
          <DatePicker
            value={selectedDateObj}
            onChange={setSelectedDateObj}
            format="YYYY/MM/DD"
            allowClear={false}
          />
        </div>
        <div className="shift-controls">
          <button className={selectedShift === 'all' ? 'active' : ''} onClick={() => setSelectedShift('all')}>All Shifts</button>
          <button className={selectedShift === 'morning' ? 'active' : ''} onClick={() => setSelectedShift('morning')}>Morning</button>
          <button className={selectedShift === 'night' ? 'active' : ''} onClick={() => setSelectedShift('night')}>Evening</button>
          {isAdmin && (
            <button
              className={cacheDisabled ? 'active' : ''}
              onClick={() => setCacheDisabled(!cacheDisabled)}
              title="Toggle live-status caching"
            >
              Cache {cacheDisabled ? 'Off' : 'On'}
            </button>
          )}
          <input
            type="checkbox"
            checked={hideLoadEfficiency}
            onChange={(e) => setHideLoadEfficiency(e.target.checked)}
            className="hide-load-efficiency-checkbox"
            title="Hide Runtime Load"
          />
        </div>
      </div>
    </header>
  );
};

export default App;
