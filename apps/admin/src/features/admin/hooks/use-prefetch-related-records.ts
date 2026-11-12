import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AdminRelatedRecordType } from '@stepwhere/types'
import {
  prefetchRelatedRecord,
  type RelatedRecordRef,
} from '../lib/related-records'

export type { RelatedRecordRef } from '../lib/related-records'

function dedupeRecords(records: RelatedRecordRef[]) {
  const seen = new Set<string>()
  const deduped: Array<{ type: AdminRelatedRecordType; id: string }> = []

  for (const record of records) {
    if (!record.id) {
      continue
    }

    const key = `${record.type}:${record.id}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push({
      type: record.type,
      id: record.id,
    })
  }

  return deduped
}

export function usePrefetchRelatedRecords(records: RelatedRecordRef[]) {
  const queryClient = useQueryClient()
  const deduped = useMemo(() => dedupeRecords(records), [records])

  useEffect(() => {
    void Promise.all(
      deduped.map((record) => prefetchRelatedRecord(queryClient, record))
    )
  }, [deduped, queryClient])
}
