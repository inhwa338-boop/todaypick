import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#08090a',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '20%',
      }}
    >
      <div
        style={{
          color: '#e4f222',
          fontSize: 280,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        오
      </div>
    </div>
  )
}
