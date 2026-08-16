import { getElectrodePosition, resolveMontageElectrodes } from '../src/topography/electrodes'

describe('electrodes', () => {
    test('resolves a standard label', () => {
        const position = getElectrodePosition('Cz')
        expect(position).not.toBeNull()
        // Cz sits on the midline at the top of the head, so x is zero and z is the largest coordinate.
        expect(Math.abs(position!.x)).toBeLessThan(3e-3)
        expect(position!.z).toBeGreaterThan(Math.abs(position!.y))
    })

    test('matches labels case-insensitively', () => {
        expect(getElectrodePosition('fp1')).toEqual(getElectrodePosition('FP1'))
        expect(getElectrodePosition('Fp1')).toEqual(getElectrodePosition('FP1'))
    })

    test('falls back to the part before the first hyphen for referenced labels', () => {
        expect(getElectrodePosition('Fp1-Ref')).toEqual(getElectrodePosition('Fp1'))
        expect(getElectrodePosition('Cz-A1A2')).toEqual(getElectrodePosition('Cz'))
    })

    test('the pre-1991 temporal names land exactly on their modern equivalents', () => {
        // Field map channel matching is by position, so any drift here silently breaks old recordings.
        expect(getElectrodePosition('T3')).toEqual(getElectrodePosition('T7'))
        expect(getElectrodePosition('T4')).toEqual(getElectrodePosition('T8'))
        expect(getElectrodePosition('T5')).toEqual(getElectrodePosition('P7'))
        expect(getElectrodePosition('T6')).toEqual(getElectrodePosition('P8'))
    })

    test('the left and right hemisphere labels mirror each other across the midline', () => {
        for (const [left, right] of [['Fp1', 'Fp2'], ['C3', 'C4'], ['O1', 'O2'], ['T7', 'T8']]) {
            const l = getElectrodePosition(left)!
            const r = getElectrodePosition(right)!
            expect(l.x).toBeLessThan(0)
            expect(r.x).toBeGreaterThan(0)
            expect(Math.abs(l.x + r.x)).toBeLessThan(5e-3)
        }
    })

    test('the anterior labels sit in front of the posterior ones', () => {
        expect(getElectrodePosition('Fpz')!.y).toBeGreaterThan(getElectrodePosition('Oz')!.y)
    })

    test('resolves the FC/CP labels that the 10-10 system actually names FT/TP', () => {
        // There is no FC7 or CP8 in the standard, but recordings and setup files use those names
        // regularly, and an unresolved label is dropped silently rather than reported.
        expect(getElectrodePosition('FC7')).toEqual(getElectrodePosition('FT7'))
        expect(getElectrodePosition('FC8')).toEqual(getElectrodePosition('FT8'))
        expect(getElectrodePosition('CP7')).toEqual(getElectrodePosition('TP7'))
        expect(getElectrodePosition('CP8')).toEqual(getElectrodePosition('TP8'))
        // The standard names for the same row must not be affected by the alias.
        expect(getElectrodePosition('FC5')).not.toEqual(getElectrodePosition('FT7'))
    })

    test('covers every electrode of the bundled 10-10 setup', () => {
        // Nz is the nasion, a fiducial rather than an electrode, so it is correctly absent.
        const setup = ('Fp1,Fp2,Af3,Af4,Af7,Af8,F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,FC1,FC2,FC3,FC4,FC5,FC6,'
                     + 'FC7,FC8,FT9,FT10,C1,C2,C3,C4,C5,C6,T7,T8,T9,T10,A1,A2,CP1,CP2,CP3,CP4,CP5,CP6,'
                     + 'TP7,TP8,TP9,TP10,P1,P2,P3,P4,P5,P6,P7,P8,P9,P10,PO3,PO4,PO7,PO8,O1,O2,Fpz,Fz,'
                     + 'FCz,Cz,CPz,Pz,POz,Oz,Iz').split(',')
        const { positions } = resolveMontageElectrodes(setup)
        expect(positions).toHaveLength(setup.length)
    })

    test('covers every electrode of the bundled 10-20 setup', () => {
        const setup = 'Fp1,Fp2,F3,F4,F7,F8,C3,C4,P3,P4,T3,T4,T5,T6,O1,O2,Fz,Cz,Pz'.split(',')
        expect(resolveMontageElectrodes(setup).positions).toHaveLength(setup.length)
    })

    test('returns null for something that is not an electrode', () => {
        expect(getElectrodePosition('EKG')).toBeNull()
        expect(getElectrodePosition('')).toBeNull()
        expect(getElectrodePosition('Photic')).toBeNull()
    })

    test('resolveMontageElectrodes drops unresolved labels and reports the surviving indices', () => {
        const { indices, positions } = resolveMontageElectrodes(['Fp1', 'EKG', 'Cz', 'Annotations', 'O2'])
        expect(indices).toEqual([0, 2, 4])
        expect(positions).toHaveLength(3)
        expect(positions[1]).toEqual(getElectrodePosition('Cz'))
    })

    test('resolveMontageElectrodes returns nothing for a list with no electrodes', () => {
        expect(resolveMontageElectrodes(['EKG', 'EMG']).positions).toHaveLength(0)
    })
})
