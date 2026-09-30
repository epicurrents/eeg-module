/**
 * Unit tests for EegStudyLoader: the modality claim every EEG loading path has to make, and the
 * memory-budget decision that says whether a recording can be opened at all.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { beforeEach, describe, expect, test } from 'vitest'
import type { StudyContext } from '@epicurrents/core/types'
import EegStudyLoader from '../src/loader/EegStudyLoader'

const MB = 1024*1024

const setRuntime = (maxLoadCacheSize: number | null, dataBlockDuration = 3600) => {
    ;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = maxLoadCacheSize === null
        ? undefined
        : { RUNTIME: { SETTINGS: { modules: { eeg: {} }, app: { maxLoadCacheSize, dataBlockDuration } } } }
}

const makeLoader = () => {
    const loader = new EegStudyLoader('n', ['eeg'], {} as never)
    ;(loader as unknown as { _studyImporter: unknown })._studyImporter = {
        getFileTypeWorker: () => ({ addEventListener: () => undefined }),
    }
    return loader
}

/** A loaded study of `channels` channels, each `seconds` long at `samplingRate`. */
const studyOf = (channels: number, seconds: number, samplingRate = 256) => ({
    name: 'study',
    files: [],
    meta: {
        channels: Array.from({ length: channels }, (_, i) => ({
            name: `C${i}`, label: `C${i}`, modality: 'eeg', averaged: false, samplingRate,
            unit: 'uV', visible: true, sampleCount: seconds*samplingRate,
        })),
        header: { recordingStartTime: 0, dataUnitCount: seconds, dataUnitDuration: 1 },
    },
})

describe('EegStudyLoader modality claim', () => {
    beforeEach(() => setRuntime(1024*MB))

    test('reports the EEG modality', () => {
        expect(makeLoader().resourceModality).toBe('eeg')
    })

    test('claims the study and every one of its signal files, not just the first', () => {
        // A study assembled from several files would otherwise present itself to the service as
        // whichever member happened to sort first.
        const loader = makeLoader()
        const study = {
            modality: 'unknown',
            files: [{ modality: 'signal' }, { modality: 'signal' }, { modality: 'meta' }],
        } as unknown as StudyContext
        return loader.loadFromFile({} as File, undefined, study).then(claimed => {
            expect(claimed?.modality).toBe('eeg')
            expect(claimed?.files.map(f => f.modality)).toEqual(['eeg', 'eeg', 'meta'])
        })
    })

    test('leaves a file of another modality alone', () => {
        const loader = makeLoader()
        const study = { modality: 'x', files: [{ modality: 'video' }] } as unknown as StudyContext
        return loader.loadFromUrl('u', undefined, study).then(claimed => {
            expect(claimed?.files[0].modality).toBe('video')
        })
    })

    test('a study that did not load stays null rather than becoming an empty EEG study', () => {
        return makeLoader().loadFromUrl('u').then(claimed => expect(claimed).toBeNull())
    })

    test('the directory path claims the study too', () => {
        const loader = makeLoader()
        const study = { modality: 'x', files: [{ modality: 'signal' }] } as unknown as StudyContext
        ;(loader as unknown as { _study: unknown })._study = study
        return loader.loadFromDirectory({} as never).then(claimed => {
            expect(claimed?.modality).toBe('eeg')
            expect(claimed?.files[0].modality).toBe('eeg')
        })
    })
})

describe('EegStudyLoader memory budget', () => {
    const load = async (study: unknown, cacheMiB: number | null, blockCap = 3600) => {
        setRuntime(cacheMiB === null ? null : cacheMiB*MB, blockCap)
        const loader = makeLoader()
        ;(loader as unknown as { _study: unknown })._study = study
        return await loader.getResource()
    }

    test('a recording that fits whole is loaded', async () => {
        // One channel, 100 s at 256 Hz — 100 kB of floats.
        const recording = await load(studyOf(1, 100), 100)
        expect(recording?.state).toBe('loaded')
    })

    test('a recording too large to hold whole is still loaded, through the rolling cache', async () => {
        // 32 channels of 24 h is far past a 64 MiB budget, but three blocks of it are not.
        const recording = await load(studyOf(32, 24*3600), 64)
        expect(recording?.state).toBe('loaded')
    })

    test('a recording whose rolling cache cannot fit is refused with a reason', async () => {
        // The floor is three 60 s blocks per channel, so a budget under that cannot open the recording
        // at any block size, and the refusal has to name itself rather than opening an empty view.
        const recording = await load(studyOf(64, 24*3600), 1)
        expect(recording?.state).toBe('error')
        expect(recording?.errorReason).toContain('memory budget')
    })

    test('the block cap bounds the working set of a recording that would otherwise fit whole', async () => {
        // A generous budget stops growing the block at the configured ceiling rather than at the
        // recording length, which is what keeps the two sides of the cache agreeing.
        const recording = await load(studyOf(4, 8*3600), 512, 600)
        expect(recording?.state).toBe('loaded')
    })

    test('a study missing its channels or header yields no resource', async () => {
        expect(await load({ name: 's', files: [], meta: { header: {} } }, 100)).toBeNull()
        expect(await load({ name: 's', files: [], meta: { channels: [] } }, 100)).toBeNull()
        expect(await load({ files: [], meta: studyOf(1, 10).meta }, 100)).toBeNull()
    })

    test('no application runtime refuses the recording rather than handing back an unchecked one', async () => {
        // The budget cannot be checked without the app settings, and a recording returned in its
        // constructed state would be opened as though it had passed.
        const recording = await load(studyOf(1, 100), null)
        expect(recording?.state).toBe('error')
        expect(recording?.errorReason).toContain('runtime')
    })

    test('the loaded study is cleared, so a second call does not build the same resource twice', async () => {
        setRuntime(100*MB)
        const loader = makeLoader()
        ;(loader as unknown as { _study: unknown })._study = studyOf(1, 100)
        expect(await loader.getResource()).not.toBeNull()
        expect(await loader.getResource()).toBeNull()
    })
})
