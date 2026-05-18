// hooks/useEvaluation.ts
// fallow-ignore-next-line complexity
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById } from '@/lib/evaluationService'
import { Evaluation } from '@/types'

export function useEvaluation(evaluationId: string) {
  const router = useRouter()
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const session = await getSession()
        if (!session?.user) {
          router.push('/login')
          return
        }
        setUserId(session.user.id)
        const data = await loadById(evaluationId)
        setEvaluation(data)
      } catch (e: any) {
        console.error('useEvaluation error', e)
        setError(e.message ?? 'Failed to load evaluation')
      } finally {
        setLoading(false)
      }
    }
    if (evaluationId) init()
  }, [evaluationId, router])

  return { evaluation, loading, error, userId }
}
