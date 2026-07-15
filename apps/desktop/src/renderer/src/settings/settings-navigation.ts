export const SETTINGS_DISCARD_MESSAGE = '当前修改尚未保存。要放弃修改吗？'

export const canLeaveSettings = (
  dirty: boolean,
  confirmDiscard: (message: string) => boolean,
): boolean => !dirty || confirmDiscard(SETTINGS_DISCARD_MESSAGE)
