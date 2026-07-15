import type { ClassroomPreferences, TutorProfile, UserProfile } from '@deepstorming/domain'

export type LearningSettingsSnapshot = Readonly<{
  userProfile: UserProfile
  tutorProfiles: readonly TutorProfile[]
  classroomPreferences: ClassroomPreferences
}>

export type SettingsWriteResult<T> =
  | Readonly<{ status: 'applied'; value: T }>
  | Readonly<{ status: 'stale' }>
  | Readonly<{ status: 'not_found' }>

export interface LearningSettingsRepositoryPort {
  getSnapshot(): Promise<LearningSettingsSnapshot | undefined>
  bootstrap(snapshot: LearningSettingsSnapshot): Promise<LearningSettingsSnapshot>
  saveUserProfile(
    expectedRevision: number,
    profile: UserProfile,
  ): Promise<SettingsWriteResult<UserProfile>>
  createTutor(profile: TutorProfile): Promise<SettingsWriteResult<TutorProfile>>
  updateTutor(
    expectedRevision: number,
    profile: TutorProfile,
  ): Promise<SettingsWriteResult<TutorProfile>>
  countActiveTutors(): Promise<number>
  saveClassroomPreferences(preferences: ClassroomPreferences): Promise<ClassroomPreferences>
}

export interface AvatarAssetStorePort {
  importAvatar(sourcePath: string): Promise<Readonly<{ assetId: string }>>
  readAvatar(assetId: string): Promise<
    Readonly<{
      assetId: string
      mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
      data: Uint8Array
    }>
  >
  removeAvatar(assetId: string): Promise<void>
}
