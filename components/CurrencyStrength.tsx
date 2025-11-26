'use client'

interface CurrencyData {
  id: string
  name: string
  title: string
  value: number
  momentum: number
  trend: 'bullish' | 'bearish'
}

interface CurrencyStrengthProps {
  data: CurrencyData[]
}

const flagEmojis: Record<string, string> = {
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  CHF: '🇨🇭',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  NZD: '🇳🇿',
  USD: '🇺🇸',
}

export default function CurrencyStrength({ data }: CurrencyStrengthProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
        Loading currency data...
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: '600px' }}>
        <thead>
          <tr>
            <th style={{ width: '50px' }}>#</th>
            <th>Currency</th>
            <th>7-Day Change</th>
            <th style={{ width: '40%' }}>Momentum</th>
            <th style={{ textAlign: 'right' }}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {data.map((currency, index) => (
            <tr key={currency.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
              <td style={{
                fontWeight: '700',
                color: index === 0 ? 'var(--accent-success)' : index === data.length - 1 ? 'var(--accent-danger)' : 'var(--text-muted)'
              }}>
                {index + 1}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{flagEmojis[currency.name] || '🏳️'}</span>
                  <div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{currency.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{currency.title}</div>
                  </div>
                </div>
              </td>
              <td>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: '600',
                  color: currency.value >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'
                }}>
                  {currency.value >= 0 ? '+' : ''}{currency.value.toFixed(2)}%
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="strength-bar" style={{ flex: 1 }}>
                    <div
                      className={`strength-fill ${currency.trend === 'bullish' ? 'strength-bullish' : 'strength-bearish'}`}
                      style={{ width: `${currency.momentum}%` }}
                    />
                  </div>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--text-muted)',
                    minWidth: '36px'
                  }}>
                    {currency.momentum}
                  </span>
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className={`badge ${currency.trend === 'bullish' ? 'badge-success' : 'badge-danger'}`}>
                  {currency.trend === 'bullish' ? '↑ Strong' : '↓ Weak'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
