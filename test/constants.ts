export const HOST_ADDRESS = '0x8d64B57C74ba7536a99606057E18DdDAF6bfa667'

export const TOKENS = {
  BUSD: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec', // BUSD
  USDC: '0x7D08A9f17179670582C6b7983c94b6e2c218a612', // USDC
  USDT: '0x0062fC7642E7BD9b4685901258207A6e22E23378', // USDT
  TRVL: '0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8', // TRVL
}

export const GUEST_PRIVATE_KEYS = [
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
]

export const BOOKING_SIGNATURE_TYPE = {
  BookingParameters: [
    { name: 'token', type: 'address' },
    { name: 'bookingId', type: 'string' },
    { name: 'checkInTimestamp', type: 'uint256' },
    { name: 'checkOutTimestamp', type: 'uint256' },
    { name: 'bookingExpirationTimestamp', type: 'uint256' },
    { name: 'bookingAmount', type: 'uint256' },
    { name: 'cancellationPolicies', type: 'CancellationPolicy[]' },
  ],
  CancellationPolicy: [
    { name: 'expiryTime', type: 'uint256' },
    { name: 'refundAmount', type: 'uint256' },
  ],
}
