import { createApplicationInfo, type ApplicationInfo } from '@deepstorming/domain'

import type { AppInfoPort } from './app-info-port'

export class GetApplicationInfo {
  public constructor(private readonly appInfo: AppInfoPort) {}

  public execute(): ApplicationInfo {
    return createApplicationInfo({
      name: this.appInfo.getName(),
      version: this.appInfo.getVersion(),
      platform: this.appInfo.getPlatform(),
    })
  }
}
