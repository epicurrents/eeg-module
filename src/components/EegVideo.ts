/**
 * EpiCurrents EEG video.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { type VideoAttachment } from '@epicurrents/core/dist/types'

export default class EegVideo implements VideoAttachment {
    private _endTime: number
    private _group: number
    private _startTime: number
    private _syncPoints: { [eegTime: number]: number }[] = []
    private _url: string

    constructor (
        url: string,
        startTime: number,
        endTime: number,
        group = 0,
        syncPoints?: { [eegTime: number]: number }[]
    ) {
        this._url = url
        this._startTime = startTime
        this._endTime = endTime
        this._group = group
        if (syncPoints) {
            this._syncPoints = syncPoints
        }
    }

    // Getters and setters
    get endTime () {
        return this._endTime
    }
    set endTime (time: number) {
        this._endTime = time
    }
    get group () {
        return this._group
    }
    set group (group: number) {
        this._group = group
    }
    get startTime () {
        return this._startTime
    }
    set startTime (time: number) {
        this._startTime = time
    }
    get syncPoints () {
        return this._syncPoints
    }
    set syncPoints (syncPoints: { [eegTime: number]: number }[]) {
        this._syncPoints = syncPoints
    }
    get url () {
        return this._url
    }
    set url (url: string) {
        this._url = url
    }
}
