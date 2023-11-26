import numpy as np
from matplotlib import pyplot as plt
import base64
import json
import mne
import io

# Set up variables
cursor_pos = 0
evoked = None
fig_topo, ax_topo = plt.subplots()
fig_time, ax_time = plt.subplots(ncols=3, nrows=3)
info = None
montage = None
plot_height = None
plot_width = None
time_interval = 0

def list_channels ():
    global info
    if info is None:
        return '[]'
    else:
        return json.dumps(info.ch_names)

def plot_data ():
    global ax_topo, cursor_pos, evoked, fig_topo, time_interval
    if evoked is None:
        return False
    ax_topo.clear()
    mne.viz.plot_topomap(
        evoked.data[:, cursor_pos],
        evoked.info,
        axes=ax_topo,
        show=False
    )
    buffer = io.BytesIO()
    fig_topo.savefig(buffer, dpi=100, format='png')
    buffer.seek(0)
    cursor = 'data:image/png;base64,' + base64.b64encode(buffer.read()).decode('UTF-8')
    if not time_interval:
        return cursor
    times = np.arange(-4*time_interval, 4.5*time_interval, time_interval)
    for ax in ax_time.flatten():
        ax.clear()
    evoked.plot_topomap(
        times,
        ch_type='eeg',
        axes=ax_time.flatten(),
        colorbar=False,
        time_unit='ms',
        show=False
    )
    buffer = io.BytesIO()
    fig_time.savefig(buffer, dpi=100, format='png')
    buffer.seek(0)
    propagation = 'data:image/png;base64,' + base64.b64encode(buffer.read()).decode('UTF-8')
    return cursor + "|" + propagation


def set_channels ():
    from js import channels, sfreq
    global info, montage
    if montage is None:
        return False
    info = mne.create_info(ch_names=json.loads(channels), sfreq=sfreq, ch_types='eeg')
    return True

def set_data ():
    global cursor_pos, evoked, info, time_interval
    if info is None:
        return False
    from js import cursor, data, interval
    cursor_pos = cursor
    time_interval = interval/1000
    evoked = mne.EvokedArray(np.array(json.loads(data)), info, tmin=-0.1)
    evoked.set_montage(montage)
    return True

def set_resolution ():
    global fig_topo, time_time
    from js import height, width
    fig_topo.set_size_inches(width/100, height/100)
    fig_time.set_size_inches(width/110, height/100)

def set_montage ():
    global montage
    from js import montage as mtg_name
    montage = mne.channels.make_standard_montage(mtg_name)
    return True
