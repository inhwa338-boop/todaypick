export default function manifest() {
  return {
    name: '오늘은 이거다',
    short_name: '오이다',
    description: '유명하지만 나만 몰랐던 유튜브, 오늘 발견하세요',
    start_url: '/',
    display: 'standalone',
    background_color: '#08090a',
    theme_color: '#08090a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
