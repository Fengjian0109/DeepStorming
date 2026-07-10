import type { AppInfoPort } from '@deepstorming/application'
import type { App } from 'electron'

export class ElectronAppInfoAdapter implements AppInfoPort {
  public constructor(
    private readonly app: Pick<App, 'getName'>,
    private readonly applicationVersion: string,
  ) {}

  public getName(): string {
    return this.app.getName()
  }

  public getVersion(): string {
    return this.applicationVersion
  }

  public getPlatform(): string {
    return process.platform
  }
}
