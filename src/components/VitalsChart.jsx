import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function VitalsChart({ history }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="t" tickFormatter={(t) => `${t}s`} tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis yAxisId="hr" domain={[40, 160]} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="spo2" orientation="right" domain={[80, 100]} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(t) => `t = ${t}s`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="hr"
            type="monotone"
            dataKey="hr"
            name="Heart rate (bpm)"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="spo2"
            type="monotone"
            dataKey="spo2"
            name="SpO₂ (%)"
            stroke="#0284c7"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
