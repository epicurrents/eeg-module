import json

import matplotlib
matplotlib.use('Agg')
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib import pyplot as plt
import mne
import numpy as np

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

cursor_pos = 0
evoked = None
fig_topo, ax_topo = plt.subplots()
fig_time, ax_time = plt.subplots(ncols=3, nrows=3)
info = None
montage = None
plot_height = None
plot_width = None
time_interval = 0
topomap_canvas = None
time_canvas = None

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _draw_fig_to_canvas(fig, canvas):
    """
    Render a matplotlib figure directly onto a JS canvas element via
    ``putImageData``.  Faster than base64 round-tripping because there is no
    encoding / decoding step and the pixel data is written straight into the
    canvas backing store.

    The canvas ``width`` and ``height`` properties are updated to match the
    figure dimensions so the caller does not need to pre-size it.
    """
    from js import ImageData, Uint8ClampedArray
    agg = FigureCanvasAgg(fig)
    agg.draw()
    w, h = agg.get_width_height()
    rgba = np.frombuffer(agg.buffer_rgba(), dtype=np.uint8)
    canvas.width = w
    canvas.height = h
    ctx = canvas.getContext('2d')
    img = ImageData.new(Uint8ClampedArray.new(rgba.tobytes()), w, h)
    ctx.putImageData(img, 0, 0)

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

def list_channels():
    global info
    if info is None:
        return '[]'
    return json.dumps(info.ch_names)


def set_canvas():
    """
    Set the canvas elements used for plotting.

    JS params
    ---------
    topomap : CanvasElement | OffscreenCanvas
        Canvas for the single-frame topomap (current cursor position).
    time : CanvasElement | OffscreenCanvas
        Canvas for the multi-frame propagation topomap.  Optional — pass
        ``null`` / ``undefined`` if only the cursor topomap is needed.
    """
    global topomap_canvas, time_canvas
    from js import topomap, time
    topomap_canvas = topomap
    time_canvas = time if time is not None else None
    return True


def set_channels():
    from js import channels, sfreq
    global info, montage
    if montage is None:
        return False
    info = mne.create_info(ch_names=json.loads(channels), sfreq=sfreq, ch_types='eeg')
    return True


def set_data():
    global cursor_pos, evoked, info, time_interval
    if info is None:
        return False
    from js import cursor, data, interval
    cursor_pos = cursor
    time_interval = interval / 1000
    evoked = mne.EvokedArray(np.array(json.loads(data)), info, tmin=-0.1)
    evoked.set_montage(montage)
    return True


def set_montage():
    global montage
    from js import montage as mtg_name
    montage = mne.channels.make_standard_montage(mtg_name)
    return True


def set_resolution():
    global fig_topo, fig_time
    from js import height, width
    fig_topo.set_size_inches(width / 100, height / 100)
    fig_time.set_size_inches(width / 110, height / 100)

# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

def plot_data():
    """
    Draw topomaps directly onto the registered canvas elements.

    Always draws the cursor-position topomap onto ``topomap_canvas``.
    If ``time_canvas`` is set and ``time_interval`` is non-zero, also draws
    the multi-frame propagation topomap.

    Returns ``True`` on success, ``False`` if required state is missing.
    """
    global ax_topo, cursor_pos, evoked, fig_topo, fig_time, ax_time, time_interval
    if evoked is None or topomap_canvas is None:
        return False

    # --- Cursor-position topomap ---
    ax_topo.clear()
    mne.viz.plot_topomap(
        evoked.data[:, cursor_pos],
        evoked.info,
        axes=ax_topo,
        show=False,
    )
    _draw_fig_to_canvas(fig_topo, topomap_canvas)

    # --- Multi-frame propagation topomap (optional) ---
    if time_interval and time_canvas is not None:
        times = np.arange(-4 * time_interval, 4.5 * time_interval, time_interval)
        for ax in ax_time.flatten():
            ax.clear()
        evoked.plot_topomap(
            times,
            ch_type='eeg',
            axes=ax_time.flatten(),
            colorbar=False,
            time_unit='ms',
            show=False,
        )
        _draw_fig_to_canvas(fig_time, time_canvas)

    return True
