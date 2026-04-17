/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import ComponentCard from '@/components/common/ComponentCard';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';

const ReactApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
});

interface BarChartPlaceholderProps {
  shiftwiseData: any[];
  selectedDate: string;
  selectedShift: 'all' | 'morning' | 'night';
  deviceSettingsMap: Record<number, Record<string, any>>;
}

type ChartMode = 'previous-day' | 'morning-vs-night' | 'week-average';

type RuntimeBucket = {
  morning: number;
  night: number;
  total: number;
};

type MachineRuntimeMap = Record<string, {
  label: string;
  runtimeByDate: Record<string, RuntimeBucket>;
}>;

const SHIFT_KEYS = ['morning', 'night'] as const;

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const getMachineLabel = (
  deviceNo: number,
  channelKey: string,
  channelValue: Record<string, any>,
  deviceSettingsMap: Record<number, Record<string, any>>
) => {
  const configuredName = deviceSettingsMap?.[deviceNo]?.[channelKey]?.Name;
  if (typeof configuredName === 'string' && configuredName.trim() !== '') {
    return configuredName.trim();
  }

  if (typeof channelValue?.channel_name === 'string' && channelValue.channel_name.trim() !== '') {
    return channelValue.channel_name.trim();
  }

  return `Device ${deviceNo} ${channelKey.toUpperCase()}`;
};

const buildMachineRuntimeMap = (
  docs: any[],
  deviceSettingsMap: Record<number, Record<string, any>>
): MachineRuntimeMap => docs.reduce((acc: MachineRuntimeMap, doc) => {
  const deviceNo = doc?.deviceno;
  const currentDate = doc?.currentdate;

  if (typeof deviceNo !== 'number' || typeof currentDate !== 'string') {
    return acc;
  }

  Object.entries(doc).forEach(([key, value]) => {
    if (!/^ch\d+$/i.test(key) || !value || typeof value !== 'object') {
      return;
    }

    const machineKey = `${deviceNo}:${key}`;
    const label = getMachineLabel(deviceNo, key, value as Record<string, any>, deviceSettingsMap);
    const bucket = SHIFT_KEYS.reduce((shiftTotals, shiftKey) => {
      const runTime = toNumber((value as Record<string, any>)?.[shiftKey]?.run_time);
      shiftTotals[shiftKey] = runTime;
      shiftTotals.total += runTime;
      return shiftTotals;
    }, { morning: 0, night: 0, total: 0 } as RuntimeBucket);

    if (!acc[machineKey]) {
      acc[machineKey] = {
        label,
        runtimeByDate: {},
      };
    }

    acc[machineKey].label = label;
    acc[machineKey].runtimeByDate[currentDate] = bucket;
  });

  return acc;
}, {});

const getRuntimeValue = (bucket: RuntimeBucket | undefined, selectedShift: 'all' | 'morning' | 'night') => {
  if (!bucket) {
    return 0;
  }

  if (selectedShift === 'morning') {
    return bucket.morning;
  }

  if (selectedShift === 'night') {
    return bucket.night;
  }

  return bucket.total;
};

const formatMinutes = (value: number) => `${(value / 60).toFixed(2)} h`;

const parseStorageDate = (value: string) => {
  const [year, month, day] = value.split('/');
  if (!year || !month || !day) {
    return dayjs();
  }

  return dayjs(`20${year}-${month}-${day}`);
};

const BarChartPlaceholder: React.FC<BarChartPlaceholderProps> = ({
  shiftwiseData,
  selectedDate,
  selectedShift,
  deviceSettingsMap,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('previous-day');
  const [historyDocs, setHistoryDocs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const deviceNumbers = useMemo(
    () => shiftwiseData.map((item) => item?.deviceno).filter((value) => typeof value === 'number'),
    [shiftwiseData]
  );

  useEffect(() => {
    let isActive = true;

    const fetchHistory = async () => {
      if (deviceNumbers.length === 0 || !selectedDate) {
        setHistoryDocs([]);
        return;
      }

      setIsLoading(true);

      try {
        const dates = Array.from({ length: 7 }, (_, index) =>
          parseStorageDate(selectedDate).subtract(index + 1, 'day').format('YY/MM/DD')
        );

        const responses = await Promise.all(
          dates.map(async (date) => {
            const response = await fetch(
              `/api/factory-genie/live-status?date=${date}&deviceNo=${deviceNumbers.join(',')}&source=all`,
              { cache: 'no-store' }
            );

            if (!response.ok) {
              return [];
            }

            const result = await response.json();
            return Array.isArray(result?.data) ? result.data : [];
          })
        );

        if (isActive) {
          setHistoryDocs(responses.flat());
        }
      } catch (error) {
        console.error('Error fetching bar chart comparison data:', error);
        if (isActive) {
          setHistoryDocs([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isActive = false;
    };
  }, [deviceNumbers, selectedDate]);

  const machineRuntimeMap = useMemo(
    () => buildMachineRuntimeMap([...shiftwiseData, ...historyDocs], deviceSettingsMap),
    [deviceSettingsMap, historyDocs, shiftwiseData]
  );

  const previousDate = parseStorageDate(selectedDate).subtract(1, 'day').format('YY/MM/DD');
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    parseStorageDate(selectedDate).subtract(index + 1, 'day').format('YY/MM/DD')
  );

  const categories = useMemo(
    () => Object.values(machineRuntimeMap).map((entry) => entry.label),
    [machineRuntimeMap]
  );

  const series = useMemo(() => {
    const machines = Object.values(machineRuntimeMap);

    if (chartMode === 'morning-vs-night') {
      return [
        {
          name: 'Morning',
          data: machines.map((entry) => entry.runtimeByDate[selectedDate]?.morning ?? 0),
        },
        {
          name: 'Night',
          data: machines.map((entry) => entry.runtimeByDate[selectedDate]?.night ?? 0),
        },
      ];
    }

    if (chartMode === 'week-average') {
      return [
        {
          name: `Selected (${selectedDate})`,
          data: machines.map((entry) => getRuntimeValue(entry.runtimeByDate[selectedDate], selectedShift)),
        },
        {
          name: 'Week Avg',
          data: machines.map((entry) => {
            const values = weekDates
              .map((date) => getRuntimeValue(entry.runtimeByDate[date], selectedShift))
              .filter((value) => value > 0);

            if (values.length === 0) {
              return 0;
            }

            return values.reduce((sum, value) => sum + value, 0) / values.length;
          }),
        },
      ];
    }

    return [
      {
        name: `Selected (${selectedDate})`,
        data: machines.map((entry) => getRuntimeValue(entry.runtimeByDate[selectedDate], selectedShift)),
      },
      {
        name: `Previous (${previousDate})`,
        data: machines.map((entry) => getRuntimeValue(entry.runtimeByDate[previousDate], selectedShift)),
      },
    ];
  }, [chartMode, machineRuntimeMap, previousDate, selectedDate, selectedShift, weekDates]);

  const chartTitle = chartMode === 'morning-vs-night'
    ? `Morning vs Night runtime on ${selectedDate}`
    : chartMode === 'week-average'
      ? `Selected date runtime vs previous 7-day average`
      : `Selected date runtime vs previous day`;

  const chartDescription = chartMode === 'morning-vs-night'
    ? 'Each machine shows the selected date split by shift.'
    : chartMode === 'week-average'
      ? `Each machine compares ${selectedDate} against the average runtime from ${weekDates[6]} to ${weekDates[0]}.`
      : `Each machine compares ${selectedDate} against ${previousDate}.`;

  const options: ApexOptions = useMemo(() => ({
    chart: {
      type: 'bar',
      height: 360,
      toolbar: {
        show: false,
      },
      fontFamily: 'Outfit, sans-serif',
    },
    colors: ['#465FFF', '#9CB9FF'],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '42%',
        borderRadius: 0,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 1,
      colors: ['transparent'],
    },
    xaxis: {
      categories,
      labels: {
        rotate: -25,
        trim: true,
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      title: {
        text: 'Runtime (Hours)',
      },
      labels: {
        formatter: (value) => (value / 60).toFixed(1),
      },
    },
    grid: {
      borderColor: '#e5e7eb',
      strokeDashArray: 4,
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'left',
      fontFamily: 'Outfit',
    },
    tooltip: {
      y: {
        formatter: (value) => formatMinutes(value),
      },
    },
    noData: {
      text: 'No runtime data available for the selected machines.',
    },
  }), [categories, chartMode]);

  return (
    <ComponentCard title={chartTitle} desc={chartDescription}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Per-machine runtime comparison for the selected live-status scope.
          </div>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-300 focus:outline-none sm:w-auto dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            value={chartMode}
            onChange={(event) => setChartMode(event.target.value as ChartMode)}
          >
            <option value="previous-day">Selected vs Previous Day</option>
            <option value="morning-vs-night">Morning vs Night</option>
            <option value="week-average">Selected vs Week Average</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-500 dark:border-gray-700 dark:bg-white/[0.02] dark:text-gray-400">
            Loading comparison graph...
          </div>
        ) : categories.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-500 dark:border-gray-700 dark:bg-white/[0.02] dark:text-gray-400">
            No machine runtime data available.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto custom-scrollbar">
            <div className="min-w-[1000px]">
              <ReactApexChart options={options} series={series} type="bar" height={360} />
            </div>
          </div>
        )}
      </div>
    </ComponentCard>
  );
};

export default BarChartPlaceholder;
