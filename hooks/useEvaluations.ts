import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabaseClient'
import { getSessionUserId } from '@/lib/auth'

const supabase = createBrowserClient()

async function queryEvaluations(userId: string) {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .or(`created_by.eq.${userId},reviewer_id.eq.${userId},current_holder_id.eq.${userId}`)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

async function mutateEvaluation(userId: string, evalData: any) {
  const payload = {
    ...evalData,
    created_by: userId,
    updated_at: new Date().toISOString()
  }

  const query = evalData.id
    ? supabase.from('evaluations').update(payload).eq('id', evalData.id)
    : supabase.from('evaluations').insert([payload])

  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export const useEvaluations = () => {
  const [evals, setEvals] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fetchEvals = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const userId = await getSessionUserId()
      if (!userId) {
        setEvals([])
        return
      }
      const data = await queryEvaluations(userId)
      setEvals(data)
    } catch (e: any) {
      console.error('fetchEvals failed:', e.message)
      setErr(e.message || 'Failed to fetch evaluations')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveEval = async (evalData: any) => {
    setLoading(true)
    setErr(null)
    try {
      const userId = await getSessionUserId()
      if (!userId) {
        throw new Error('You must be logged in to save evaluations')
      }
      const data = await mutateEvaluation(userId, evalData)
      await fetchEvals()
      return data
    } catch (e: any) {
      console.error('saveEval failed:', e.message)
      setErr(e.message || 'Failed to save evaluation')
      throw e
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvals()
  }, [fetchEvals])

  return {
    evaluations: evals,
    loading,
    error: err,
    refresh: fetchEvals,
    saveEvaluation: saveEval
  }
}

