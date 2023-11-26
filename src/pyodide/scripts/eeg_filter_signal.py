import numpy as np
from scipy import signal

sos = None

def construct_filter ():
    global sos
    from js import order, cf, fs, kind
    if not order or not cf or not fs or not kind:
        sos = None
        return
    if kind not in ['bandpass', 'bandstop', 'highpass', 'lowpass']:
        sos = None
        return
    if (kind == 'lowpass' or kind == 'highpass') and type(cf) != float:
        sos = None
        return
    if (kind == 'bandpass' or kind == 'bandstop') and type(cf) != list:
        sos = None
        return
    sos = signal.butter(N=order, Wn=cf, btype=kind, ouput='sos', fs=fs)

def filter_signal ():
    global sos
    from js import source, output
    if sos is None:
        return
    if output:
        output = signal.sosfiltfilt(sos, np.array(source))
    else:
        return signal.sosfiltfilt(sos, np.array(source))
