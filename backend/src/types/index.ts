export interface Task {
  id: string
  title: string
  description?: string
  priority: 'urgent' | 'normal'
  status: 'pending' | 'in-progress' | 'completed'
  createdAt: string
}

export interface LiveStats {
  totalGMV: number
  totalDuration: number
  totalViewers: number
  activeViewers: number
  totalInteractions: number
  totalOrders: number
  averageConversionRate: number
  averageDurationPerRound: number
  gmvPerHour: number
  averageDurationPerDay: number
  roundsPerDay: number
  rounds: number
  previousPeriod: {
    totalGMV: number
    totalDuration: number
    activeViewers: number
    averageConversionRate: number
    averageDurationPerRound: number
    gmvPerHour: number
    averageDurationPerDay: number
    roundsPerDay: number
  }
}
