// This file provides a simplified API interface for the dashboard
// It adapts the existing MongoDB API to work with the dashboard structure

export const API_HELPERS = {
  getShiftwiseData: (deviceId: number[], limit?: number) => 
    `/api/factory-genie/live-status?devices=${deviceId.join(',')}${limit ? `&limit=${limit}` : ''}`,
  
  getFullShiftwiseData: (deviceId: number[]) => 
    `/api/factory-genie/live-status?devices=${deviceId.join(',')}`,
  
  getDeviceData: (deviceNo: number, channelKey: string, formattedDateWithShift: string) => 
    `/api/device-data/${deviceNo}/${channelKey}/${formattedDateWithShift}`,
  
  getOffTimeData: (deviceId: number[]) => 
    `/api/off-time-data?devices=${deviceId.join(',')}`,
  
  getLatestStatus: () => 
    `/api/latest-status`
};

// Mock data for development
export const mockData = {
  shiftwiseData: [
    {
      _id: "25_25/10/12",
      ch1: {
        channel_name: "HK-03",
        morning: {
          run_time: 47,
          working_time: 158,
          value_sum: 757,
          average: 7.89,
          shift_time: "10:30",
          average_threshold: 7,
          setting_time: 30
        },
        night: {
          run_time: 0,
          working_time: 0,
          value_sum: 0,
          average: 0,
          shift_time: "10:30",
          average_threshold: 7,
          setting_time: 30
        }
      },
      currentdate: "25/10/12",
      deviceno: 25
    }
  ],
  offTimeData: [],
  latestStatus: []
};
