/**
 * The HED-SCORE term index, loaded on demand.
 *
 * Findings are coded in HED with the SCORE library; a finding's code is a short-form HED string stored under the
 * `hed` standard in an event's `codes`. The terms come from `src/components/vocabulary/hed-score.json`, generated
 * from one schema release by `tools/hed-score/generate_index.py` and never edited by hand. The file is reached through
 * a dynamic import, so a consumer that splits chunks loads it only when a picker first asks for it.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { HedSchemaMeta, HedScoreIndex, HedScoreSchema, HedScoreTerm, HedScoreTermIndex } from '#types/hed'

/** The `codes` key a HED string is stored under. */
export const HED_STANDARD = 'hed'

/** The index layout this module reads. */
export const HED_SCORE_INDEX_FORMAT = 2

let _loading: Promise<HedScoreTermIndex> | null = null

/**
 * Wrap a raw index with its lookups. Throws when the index has a layout this module does not read.
 * @param index - The index as generated.
 */
export function createHedScoreTermIndex (index: HedScoreIndex): HedScoreTermIndex {
    if (index.format !== HED_SCORE_INDEX_FORMAT) {
        throw new Error(`HED-SCORE index format ${index.format} is not ${HED_SCORE_INDEX_FORMAT}.`)
    }
    const byName = new Map<string, HedScoreTerm>(index.terms.map(term => [term.name, term]))
    const branches = new Map<string, string>()
    // Terms are listed parents first, so a parent's branch is known before its children are reached.
    for (const term of index.terms) {
        branches.set(term.name, term.parent === null ? term.name : branches.get(term.parent) ?? term.name)
    }
    const branchOf = (name: string) => branches.get(name) ?? null
    return {
        ...index,
        branchOf,
        getTerm: (name: string) => byName.get(name) ?? null,
        schemaBranchOf: (name: string) => {
            const branch = branchOf(name)
            return branch === null ? null : index.standardSubtrees[branch] ?? branch
        },
    }
}

/**
 * The `meta` a HED code is stored with, naming the release its string was written against. A host that saves a picked
 * code to a server sends this with it.
 * @param schema - The release, as an index records it.
 */
export function hedSchemaMeta (schema: HedScoreSchema): HedSchemaMeta {
    return { schema: { library: schema.library, version: schema.version, with_standard: schema.withStandard } }
}

/**
 * The HED-SCORE term index, imported on the first call and shared by every later one. A failed import is not cached,
 * so a later call tries again.
 */
export function loadHedScoreIndex (): Promise<HedScoreTermIndex> {
    if (!_loading) {
        _loading = import('#components/vocabulary/hed-score.json').then(
            module => createHedScoreTermIndex(module.default as HedScoreIndex)
        )
        _loading.catch(() => {
            _loading = null
        })
    }
    return _loading
}
