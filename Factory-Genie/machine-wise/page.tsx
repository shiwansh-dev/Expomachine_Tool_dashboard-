"use client";
import React, { useEffect, useState, useCallback } from "react";
import { CalenderIcon, DownloadIcon } from "@/icons";
import RuntimeChart from "@/components/charts/line/RuntimeChart";

interface ShiftData {
  run_time: number;
  working_time: number;
  value_sum: number;
  average: number;
  shift_time: string;
  average_threshold: number;
  setting_time: number;
}

interface ChannelData {
  channel_name: string;
  morning: ShiftData;
  night: ShiftData;
}

interface ShiftwiseData {
  _id: string;
  deviceno: number;
  currentdate: string;
  ch1: ChannelData;
  ch2: ChannelData;
  ch3: ChannelData;
  ch4: ChannelData;
  ch5: ChannelData;
  ch6: ChannelData;
  ch7: ChannelData;
  ch8: ChannelData;
}

interface ProcessedRow {
  date: string;
  channel: string;
  channelName: string;
  shift: 'morning' | 'night';
  runTime: number;
  workingTime: number;
  average: number;
  shiftTime: string;
  settingTime: number;
  runTimePercentage: number;
  runTimeEfficiency: number;
  oee: number;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface Filters {
  selectedShifts: string[];
  selectedMachines: string[];
  filterLowValues: boolean;
}

// Utility function to convert YY/MM/DD to ISO format for proper date sorting
const convertDateToISO = (dateStr: string): string => {
  // Input format: YY/MM/DD (e.g., "19/09/25" for September 25, 2019)
  // Output format: YYYY-MM-DD (e.g., "2019-09-25")
  const [year, month, day] = dateStr.split('/');
  const fullYear = `20${year}`; // Convert YY to YYYY
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export default function MachineWisePage() {
  const [, setShiftwiseData] = useState<ShiftwiseData[]>([]);
  const [processedData, setProcessedData] = useState<ProcessedRow[]>([]);
  const [filteredData, setFilteredData] = useState<ProcessedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: "",
    endDate: "",
  });
  const [filters, setFilters] = useState<Filters>({
    selectedShifts: ['morning', 'night'],
    selectedMachines: [],
    filterLowValues: true
  });
  const [availableMachines, setAvailableMachines] = useState<string[]>([]);
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Set default date range to last month
  useEffect(() => {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    
    setDateRange({
      startDate: lastMonth.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
    });
  }, []);

  // Get deviceNumbers from localStorage
  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('user');
      let deviceNumbers: number[] = [];
      
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed.deviceNo) {
          if (Array.isArray(parsed.deviceNo) && parsed.deviceNo.length > 0) {
            deviceNumbers = parsed.deviceNo;
          } else if (typeof parsed.deviceNo === 'number') {
            deviceNumbers = [parsed.deviceNo];
          }
        }
      }
      
      const direct = localStorage.getItem('deviceNo');
      if (direct) {
        // Handle comma-separated device numbers
        const directDevices = direct.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));
        if (directDevices.length > 0) {
          deviceNumbers = directDevices;
        }
      }
      
      console.log('Machine Wise - Loaded device numbers:', deviceNumbers);
      setDeviceNumbers(deviceNumbers);
    } catch {
      console.warn('Unable to read deviceNumbers from localStorage, using empty array');
      setDeviceNumbers([]);
    }
  }, []);

  const fetchShiftwiseData = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate || deviceNumbers.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch data for all devices in parallel
      console.log('Fetching shiftwise data for devices:', deviceNumbers);
      const promises = deviceNumbers.map(async (deviceNo) => {
        try {
          console.log(`Fetching data for device: ${deviceNo}`);
          const response = await fetch(
            `/api/factory-genie/shiftwise-data-v2?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&deviceNo=${deviceNo}`,
            { cache: "no-store" }
          );
          
          if (response.ok) {
            const result = await response.json();
            return result.data || [];
          }
          return [];
        } catch (error) {
          console.warn(`Failed to fetch data for device ${deviceNo}:`, error);
          return [];
        }
      });
      
      const results = await Promise.all(promises);
      
      // Combine all device data
      const allData = results.flat();
      console.log('Combined shiftwise data from all devices:', allData);
      setShiftwiseData(allData);
      
      // Process data into separate rows for each channel and shift
      const processed: ProcessedRow[] = [];
      
      allData.forEach((data: ShiftwiseData) => {
        const channels = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'];
        
        channels.forEach(channel => {
          const channelData = data[channel as keyof ShiftwiseData] as ChannelData;
          if (channelData) {
            // Morning shift
            const morningData = channelData.morning;
            const morningEfficiency = morningData.working_time > 0 
              ? (morningData.run_time / morningData.working_time) * 100 
              : 0;
            
            const morningRunTimeEfficiency = morningData.average_threshold > 0 ? (morningData.average / morningData.average_threshold) * 100 : 0;
            const morningOEE = (morningEfficiency * morningRunTimeEfficiency) / 100;
            
            processed.push({
              date: data.currentdate,
              channel: channel.toUpperCase(),
              channelName: channelData.channel_name,
              shift: 'morning',
              runTime: morningData.run_time,
              workingTime: morningData.working_time,
              average: morningData.average,
              shiftTime: morningData.shift_time,
              settingTime: morningData.setting_time,
              runTimePercentage: morningEfficiency,
              runTimeEfficiency: morningRunTimeEfficiency,
              oee: morningOEE
            });
            
            // Night shift
            const nightData = channelData.night;
            const nightEfficiency = nightData.working_time > 0 
              ? (nightData.run_time / nightData.working_time) * 100 
              : 0;
            
            const nightRunTimeEfficiency = nightData.average_threshold > 0 ? (nightData.average / nightData.average_threshold) * 100 : 0;
            const nightOEE = (nightEfficiency * nightRunTimeEfficiency) / 100;
            
            processed.push({
              date: data.currentdate,
              channel: channel.toUpperCase(),
              channelName: channelData.channel_name,
              shift: 'night',
              runTime: nightData.run_time,
              workingTime: nightData.working_time,
              average: nightData.average,
              shiftTime: nightData.shift_time,
              settingTime: nightData.setting_time,
              runTimePercentage: nightEfficiency,
              runTimeEfficiency: nightRunTimeEfficiency,
              oee: nightOEE
            });
          }
        });
      });
      
      // Sort by date in descending order (latest first) regardless of device number
      processed.sort((a, b) => {
        // Convert date from YY/MM/DD format to Date object for proper sorting
        const dateA = new Date(convertDateToISO(a.date));
        const dateB = new Date(convertDateToISO(b.date));
        
        // Primary sort: by date (latest first)
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        
        // Secondary sort: by channel name for consistency when dates are the same
        return a.channelName.localeCompare(b.channelName);
      });
      
      console.log('Sorted data (first 5 rows):', processed.slice(0, 5).map(row => ({
        date: row.date,
        channel: row.channel,
        channelName: row.channelName,
        shift: row.shift
      })));
      
      setProcessedData(processed);
      
      // Extract unique machine names for filter
      const uniqueMachines = [...new Set(processed.map(row => row.channelName))];
      setAvailableMachines(uniqueMachines);
      
      // Only set machines on initial load
      if (isInitialLoad && uniqueMachines.length > 0) {
        setFilters(prev => ({
          ...prev,
          selectedMachines: uniqueMachines
        }));
        setIsInitialLoad(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch shiftwise data");
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate, deviceNumbers, isInitialLoad]);

  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchShiftwiseData();
    }
  }, [fetchShiftwiseData, dateRange.startDate, dateRange.endDate, deviceNumbers]);


  // Apply filters to processed data
  useEffect(() => {
    let filtered = processedData.filter(row => {
      const shiftMatch = filters.selectedShifts.includes(row.shift);
      const machineMatch = filters.selectedMachines.includes(row.channelName);
      return shiftMatch && machineMatch;
    });

    // Apply low values filter if enabled - treat morning and night shifts separately
    if (filters.filterLowValues && filtered.length > 0) {
      // Calculate thresholds separately for morning and night shifts
      const morningData = filtered.filter(row => row.shift === 'morning');
      const nightData = filtered.filter(row => row.shift === 'night');
      
      let morningThreshold = 0;
      let nightThreshold = 0;
      
      if (morningData.length > 0) {
        const morningAverage = morningData.reduce((sum, row) => sum + row.runTimePercentage, 0) / morningData.length;
        morningThreshold = morningAverage * 0.1; // 10% of morning average
      }
      
      if (nightData.length > 0) {
        const nightAverage = nightData.reduce((sum, row) => sum + row.runTimePercentage, 0) / nightData.length;
        nightThreshold = nightAverage * 0.1; // 10% of night average
      }
      
      // Filter each shift separately using its own threshold
      filtered = filtered.filter(row => {
        if (row.shift === 'morning') {
          return morningThreshold === 0 || row.runTimePercentage >= morningThreshold;
        } else {
          return nightThreshold === 0 || row.runTimePercentage >= nightThreshold;
        }
      });
    }

    setFilteredData(filtered);
  }, [processedData, filters]);

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleShiftFilter = (shift: string) => {
    setFilters(prev => ({
      ...prev,
      selectedShifts: prev.selectedShifts.includes(shift)
        ? prev.selectedShifts.filter(s => s !== shift)
        : [...prev.selectedShifts, shift]
    }));
  };

  const handleMachineFilter = (machine: string) => {
    setFilters(prev => ({
      ...prev,
      selectedMachines: prev.selectedMachines.includes(machine)
        ? prev.selectedMachines.filter(m => m !== machine)
        : [...prev.selectedMachines, machine]
    }));
  };

  const handleLowValuesFilter = () => {
    setFilters(prev => ({
      ...prev,
      filterLowValues: !prev.filterLowValues
    }));
  };

  const handleDeselectAllMachines = () => {
    setFilters(prev => ({
      ...prev,
      selectedMachines: []
    }));
  };

  const handleSelectAllMachines = () => {
    setFilters(prev => ({
      ...prev,
      selectedMachines: availableMachines
    }));
  };

  const clearFilters = () => {
    setFilters({
      selectedShifts: ['morning', 'night'],
      selectedMachines: availableMachines.length > 0 ? availableMachines : [],
      filterLowValues: true
    });
  };

  const formatMinutesToHHMM = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const formatDateToDDMMYY = (dateStr: string): string => {
    // Convert from YY/MM/DD to DD/MM/YY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return dateStr; // Return original if format is unexpected
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 80) return 'text-green-600 bg-green-100';
    if (efficiency >= 60) return 'text-yellow-600 bg-yellow-100';
    if (efficiency >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const getSummaryStats = () => {
    const totalRunTime = filteredData.reduce((sum, row) => sum + row.runTime, 0);
    const totalWorkingTime = filteredData.reduce((sum, row) => sum + row.workingTime, 0);
    const averageRunTimePercentage = totalWorkingTime > 0 ? (totalRunTime / totalWorkingTime) * 100 : 0;
    const averageRunTimeEfficiency = filteredData.length > 0 
      ? filteredData.reduce((sum, row) => sum + row.runTimeEfficiency, 0) / filteredData.length 
      : 0;
    const averageOEE = filteredData.length > 0 
      ? filteredData.reduce((sum, row) => sum + row.oee, 0) / filteredData.length 
      : 0;
    
    return {
      totalRunTime,
      totalWorkingTime,
      averageRunTimePercentage,
      averageRunTimeEfficiency,
      averageOEE,
      totalRecords: filteredData.length
    };
  };

  const exportToCSV = () => {
    const csvData = filteredData.map(row => ({
      Date: formatDateToDDMMYY(row.date),
      Channel: row.channel,
      'Channel Name': row.channelName,
      Shift: row.shift,
      'Run Time': formatMinutesToHHMM(row.runTime),
      'Working Time': formatMinutesToHHMM(row.workingTime),
      'Shift Time': row.shiftTime,
      'Setting Time': row.settingTime,
      'Run Time Percentage': row.runTimePercentage.toFixed(2),
      'Run Time Efficiency': row.runTimeEfficiency.toFixed(2),
      OEE: row.oee.toFixed(2)
    }));

    const csvContent = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `machine-wise-report-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const summaryStats = getSummaryStats();

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">
          Machine Wise Report
        </h2>
        <button
          onClick={exportToCSV}
          disabled={filteredData.length === 0}
          className="inline-flex items-center justify-center gap-2.5 rounded-md bg-gray-900 px-4 py-2 text-center font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadIcon />
          Export CSV
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">
          Date Range Selection
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchShiftwiseData}
              className="w-full rounded bg-primary px-4 py-2 text-white hover:bg-opacity-90"
            >
              <CalenderIcon />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">
          Filters
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Shift Filter */}
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Shift Filter
            </label>
            <div className="flex flex-wrap gap-2">
              {['morning', 'night'].map((shift) => (
                <button
                  key={shift}
                  onClick={() => handleShiftFilter(shift)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    filters.selectedShifts.includes(shift)
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {shift.charAt(0).toUpperCase() + shift.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Machine Filter */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Machine Filter
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllMachines}
                  className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 font-medium"
                >
                  Select All
                </button>
              <button
                onClick={handleDeselectAllMachines}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                Deselect All
              </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableMachines.map((machine) => (
                <button
                  key={machine}
                  onClick={() => handleMachineFilter(machine)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    filters.selectedMachines.includes(machine)
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {machine}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Filter Actions */}
        <div className="mt-4 flex justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredData.length} of {processedData.length} records
          </div>
          <button
            onClick={clearFilters}
            className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Runtime Chart */}
      <div className="mb-6">
        <RuntimeChart 
          data={processedData} 
          filterLowValues={filters.filterLowValues}
          selectedShifts={filters.selectedShifts}
          selectedMachines={filters.selectedMachines}
        />
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Run Time</p>
              <p className="text-2xl font-bold text-blue-600">{formatMinutesToHHMM(summaryStats.totalRunTime)}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 font-bold">⏱️</span>
            </div>
          </div>
        </div>
        
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Working Time</p>
              <p className="text-2xl font-bold text-purple-600">{formatMinutesToHHMM(summaryStats.totalWorkingTime)}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 font-bold">⚙️</span>
            </div>
          </div>
        </div>
        
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Run Time Percentage</p>
              <p className="text-2xl font-bold text-green-600">{summaryStats.averageRunTimePercentage.toFixed(1)}%</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 font-bold">📊</span>
            </div>
          </div>
        </div>
        
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">OEE</p>
              <p className="text-2xl font-bold text-orange-600">{summaryStats.averageOEE.toFixed(1)}%</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
              <span className="text-orange-600 font-bold">🎯</span>
            </div>
          </div>
        </div>
        
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="filterLowValues"
                checked={filters.filterLowValues}
                onChange={handleLowValuesFilter}
                className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="filterLowValues" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter low values
              </label>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Data Table */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6.5 py-4 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Shiftwise Data Report (Devices: {deviceNumbers.join(', ')})
          </h3>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="px-6.5 py-8 text-center text-gray-500 dark:text-gray-400">
              No data found for the selected date range.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stroke bg-gray-50 text-left text-gray-700 dark:border-strokedark dark:bg-gray-800 dark:text-gray-200">
                  <th className="px-6.5 py-3 font-medium">Date</th>
                  <th className="px-6.5 py-3 font-medium">Channel</th>
                  <th className="px-6.5 py-3 font-medium">Machine Name</th>
                  <th className="px-6.5 py-3 font-medium">Shift</th>
                  <th className="px-6.5 py-3 font-medium">Run Time</th>
                  <th className="px-6.5 py-3 font-medium">Working Time</th>
                  <th className="px-6.5 py-3 font-medium">Run Time Percentage (%)</th>
                  <th className="px-6.5 py-3 font-medium">Run Time Efficiency (%)</th>
                  <th className="px-6.5 py-3 font-medium">OEE (%)</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <tr
                    key={`${row.date}-${row.channel}-${row.shift}-${index}`}
                    className="border-b border-stroke hover:bg-gray-50 dark:border-strokedark dark:hover:bg-gray-800"
                  >
                    <td className="px-6.5 py-4 font-medium text-black dark:text-white">
                      {formatDateToDDMMYY(row.date)}
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {row.channel}
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {row.channelName}
                    </td>
                    <td className="px-6.5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.shift === 'morning' 
                          ? 'text-blue-600 bg-blue-100' 
                          : 'text-purple-600 bg-purple-100'
                      }`}>
                        {row.shift}
                      </span>
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {formatMinutesToHHMM(row.runTime)}
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {formatMinutesToHHMM(row.workingTime)}
                    </td>
                    <td className="px-6.5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getEfficiencyColor(row.runTimePercentage)}`}>
                        {row.runTimePercentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6.5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getEfficiencyColor(row.runTimeEfficiency)}`}>
                        {row.runTimeEfficiency.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6.5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getEfficiencyColor(row.oee)}`}>
                        {row.oee.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
