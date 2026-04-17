export const URL = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
};

export const API_HELPERS = {
  getDeviceSettings: (deviceNo: string) => `/api/factory-genie/live-status/device-settings/${deviceNo}`,
  getGraphData: (deviceNo: string, channelKey: string, dateShift: string) => 
    `/api/factory-genie/live-status/device-data?deviceNo=${encodeURIComponent(deviceNo)}&channel=${encodeURIComponent(channelKey)}&dateShift=${encodeURIComponent(dateShift)}`,
};
