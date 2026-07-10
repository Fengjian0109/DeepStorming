import type { AppInfoPort } from '@deepstorming/application'
import type { App } from 'electron'

export class ElectronAppInfoAdapter implements AppInfoPort {
  public constructor(private readonly app: App) {}

  public getName(): string {
    return this.app.getName()
  }

  public getVersion(): string {
    return this.app.getVersion()
  }

  public getPlatform(): string {
    return process.platform
  }
}
