import type { AppInfoPort } from '@deepstorming/application'

export class FakeAppInfoPort implements AppInfoPort {
  public constructor(
    private readonly name = 'DeepStorming',
    private readonly version = '0.0.0-test',
    private readonly platform = 'linux',
  ) {}

  public getName(): string {
    return this.name
  }

  public getVersion(): string {
    return this.version
  }

  public getPlatform(): string {
    return this.platform
  }
}
