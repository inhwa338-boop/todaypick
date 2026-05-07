import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#08090a',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '22%',
      }}
    >
      <div
        style={{
          color: '#e4f222',
          fontSize: 100,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        오
      </div>
    </div>
  )
}
