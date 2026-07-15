import React from 'react'

export type UiIconName =
  | 'panel-left'
  | 'panel-right'
  | 'folder'
  | 'file'
  | 'arrow-left'
  | 'chevron-right'
  | 'plus'
  | 'pencil'
  | 'archive'
  | 'trash'
  | 'settings'
  | 'documents'
  | 'lessons'
  | 'provider'
  | 'tutor'
  | 'user'
  | 'appearance'
  | 'info'
  | 'download'
  | 'book-open'
  | 'x'

const paths: Readonly<Record<UiIconName, string>> = {
  'panel-left': 'M4 5h16v14H4zM9 5v14m4-9-3 2 3 2',
  'panel-right': 'M4 5h16v14H4zM15 5v14m-4-9 3 2-3 2',
  folder: 'M3 7h6l2 2h10v10H3z',
  file: 'M6 3h8l4 4v14H6zM14 3v5h5',
  'arrow-left': 'm14 6-6 6 6 6M8 12h10',
  'chevron-right': 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  pencil: 'm4 16-.5 4.5L8 20 19 9l-4-4zM13 7l4 4',
  archive: 'M4 7h16v13H4zM3 3h18v4H3zm6 8h6',
  trash: 'M5 7h14m-9 4v6m4-6v6M8 7l1-3h6l1 3m1 0-1 14H8L7 7',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  documents: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5',
  lessons: 'M4 5h7a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 2zm16 0h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 2z',
  provider:
    'M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm4-9v3m0 12v3M3 12h3m12 0h3M5.6 5.6 8 8m8 8 2.4 2.4M18.4 5.6 16 8M8 16l-2.4 2.4',
  tutor:
    'M8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21v-3a5 5 0 0 1 10 0v3m1-1v-2a4 4 0 0 1 8 0v2',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM3 22a9 9 0 0 1 18 0',
  appearance: 'M12 3a9 9 0 1 0 9 9c-5 1-8-3-9-9z',
  info: 'M12 11v6m0-10v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  'book-open': 'M4 5h7a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 2zm16 0h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 2z',
  x: 'M6 6l12 12M18 6 6 18',
}

export const UiIcon = ({ name, size = 18 }: { name: UiIconName; size?: number }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={paths[name]} />
  </svg>
)
