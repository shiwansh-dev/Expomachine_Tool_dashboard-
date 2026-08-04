import { getMqttSettings } from "@/lib/app-settings";

export async function getDataTopic() {
  const settings = await getMqttSettings();
  return settings.dataTopic || settings.mqttTopic;
}

export async function getMqttSubscribeTopic() {
  const settings = await getMqttSettings();
  return settings.mqttTopic || settings.dataTopic;
}
