#!/usr/bin/env python3
"""
Forja de Linhagens — Pipeline de extração de animações de inimigos.
Lê anim/e_<id>_walk.mp4 (ou _sheet.png) e anim/e_<id>_atk.mp4 (ou _sheet.png),
remove fundo magenta (chroma key + despill + erode 1px + feather),
alinha pelos pés e centro horizontal, uniformiza altura e gera:
  - img/anim/<id>_<state>.png  (atlas horizontal)
  - img/anim/<id>_<state>.json (retângulos, pivô, fps, impactFrame)
  - img/anim/preview_<id>_<state>.gif (prévia animada)
"""

import argparse
import ctypes
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
ANIM_DIR = REPO_ROOT / "anim"
OUT_DIR = REPO_ROOT / "img" / "anim"

TARGET_CHAR_H = 192  # Altura uniforme do personagem dentro do atlas
PAD_X = 16
PAD_TOP = 16
PAD_BOT = 12


# ===================== Decodificação de vídeo =====================

def decode_video_ffmpeg(video_path: Path, max_fps: int = 24):
    """Usa ffmpeg se estiver instalado no PATH."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    with tempfile.TemporaryDirectory() as td:
        pat = os.path.join(td, "f_%04d.png")
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error",
            "-i", str(video_path),
            "-vf", f"fps={max_fps}",
            pat
        ]
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode != 0:
            return None
        files = sorted(Path(td).glob("f_*.png"))
        frames = [Image.open(f).convert("RGB") for f in files]
        return frames, float(max_fps)


def decode_video_mf(video_path: Path):
    """Fallback nativo do Windows via Media Foundation (IMFSourceReader) — sem dependências externas."""
    from ctypes import wintypes

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    def make_guid(s: str) -> GUID:
        parts = s.strip("{}").split("-")
        d4 = bytes.fromhex(parts[3] + parts[4])
        return GUID(
            int(parts[0], 16),
            int(parts[1], 16),
            int(parts[2], 16),
            (ctypes.c_ubyte * 8)(*d4),
        )

    MF_VERSION = 0x00020070
    MF_SOURCE_READER_FIRST_VIDEO_STREAM = 0xFFFFFFFC
    MF_SOURCE_READERF_ENDOFSTREAM = 0x00000002

    MF_MT_MAJOR_TYPE = make_guid("48eba18e-f8c9-4687-bf11-0a74c9f96a8f")
    MF_MT_SUBTYPE = make_guid("f7e34c9a-42e8-4714-b74b-cb29d72c35e5")
    MF_MT_FRAME_SIZE = make_guid("1652c33d-d6b2-4012-b834-72030849a37d")
    MF_MT_FRAME_RATE = make_guid("c459a2e8-3d2c-4e44-b132-fee5156c7bb0")
    MF_MT_DEFAULT_STRIDE = make_guid("644b4e48-1e02-4516-b0eb-c01ca9d49ac6")
    MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING = make_guid("fb394f3d-ccf1-42ee-bbb3-f9b845d5681d")

    MFMediaType_Video = make_guid("73646976-0000-0010-8000-00aa00389b71")
    MFVideoFormat_RGB32 = make_guid("00000016-0000-0010-8000-00aa00389b71")

    ole32 = ctypes.windll.ole32
    mfplat = ctypes.windll.mfplat
    mfrw = ctypes.windll.mfreadwrite

    ole32.CoInitializeEx(None, 0)
    hr = mfplat.MFStartup(MF_VERSION, 0)
    if hr != 0:
        raise RuntimeError(f"MFStartup falhou: 0x{hr & 0xffffffff:08x}")

    def vtbl_call(ptr, idx, restype, *argtypes_and_vals):
        argtypes = [ctypes.c_void_p] + [a[0] for a in argtypes_and_vals]
        vals = [ptr] + [a[1] for a in argtypes_and_vals]
        vtbl = ctypes.cast(ptr, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        fn = ctypes.WINFUNCTYPE(restype, *argtypes)(vtbl[idx])
        return fn(*vals)

    def release(ptr):
        if ptr and ptr.value:
            vtbl_call(ptr, 2, wintypes.ULONG)

    attrs = ctypes.c_void_p()
    reader = ctypes.c_void_p()
    mtype = ctypes.c_void_p()
    cur_type = ctypes.c_void_p()
    frames = []
    fps = 24.0

    try:
        hr = mfplat.MFCreateAttributes(ctypes.byref(attrs), 1)
        if hr != 0:
            raise RuntimeError(f"MFCreateAttributes falhou: 0x{hr & 0xffffffff:08x}")
        # IMFAttributes::SetUINT32 = index 21
        vtbl_call(attrs, 21, ctypes.c_long, (ctypes.POINTER(GUID), ctypes.byref(MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING)), (wintypes.UINT, 1))

        hr = mfrw.MFCreateSourceReaderFromURL(ctypes.c_wchar_p(str(video_path)), attrs, ctypes.byref(reader))
        if hr != 0:
            raise RuntimeError(f"MFCreateSourceReaderFromURL falhou: 0x{hr & 0xffffffff:08x}")

        hr = mfplat.MFCreateMediaType(ctypes.byref(mtype))
        if hr != 0:
            raise RuntimeError(f"MFCreateMediaType falhou: 0x{hr & 0xffffffff:08x}")
        # IMFAttributes::SetGUID = index 24
        vtbl_call(mtype, 24, ctypes.c_long, (ctypes.POINTER(GUID), ctypes.byref(MF_MT_MAJOR_TYPE)), (ctypes.POINTER(GUID), ctypes.byref(MFMediaType_Video)))
        vtbl_call(mtype, 24, ctypes.c_long, (ctypes.POINTER(GUID), ctypes.byref(MF_MT_SUBTYPE)), (ctypes.POINTER(GUID), ctypes.byref(MFVideoFormat_RGB32)))

        # IMFSourceReader::SetCurrentMediaType = index 7
        hr = vtbl_call(reader, 7, ctypes.c_long, (wintypes.DWORD, MF_SOURCE_READER_FIRST_VIDEO_STREAM), (ctypes.c_void_p, None), (ctypes.c_void_p, mtype))
        if hr != 0:
            raise RuntimeError(f"SetCurrentMediaType falhou: 0x{hr & 0xffffffff:08x}")

        # IMFSourceReader::GetCurrentMediaType = index 6
        hr = vtbl_call(reader, 6, ctypes.c_long, (wintypes.DWORD, MF_SOURCE_READER_FIRST_VIDEO_STREAM), (ctypes.POINTER(ctypes.c_void_p), ctypes.byref(cur_type)))
        if hr != 0:
            raise RuntimeError(f"GetCurrentMediaType falhou: 0x{hr & 0xffffffff:08x}")

        # IMFAttributes::GetUINT64 = index 8
        frame_size = ctypes.c_uint64(0)
        vtbl_call(cur_type, 8, ctypes.c_long, (ctypes.POINTER(GUID), ctypes.byref(MF_MT_FRAME_SIZE)), (ctypes.POINTER(ctypes.c_uint64), ctypes.byref(frame_size)))
        width = (frame_size.value >> 32) & 0xffffffff
        height = frame_size.value & 0xffffffff

        frame_rate = ctypes.c_uint64(0)
        hr_fr = vtbl_call(cur_type, 8, ctypes.c_long, (ctypes.POINTER(GUID), ctypes.byref(MF_MT_FRAME_RATE)), (ctypes.POINTER(ctypes.c_uint64), ctypes.byref(frame_rate)))
        if hr_fr == 0 and (frame_rate.value & 0xffffffff) > 0:
            num = (frame_rate.value >> 32) & 0xffffffff
            den = frame_rate.value & 0xffffffff
            fps = num / den

        # IMFAttributes::GetUINT32 = index 7
        stride_u = wintypes.UINT(0)
        hr_st = vtbl_call(cur_type, 7, ctypes.c_long, (ctypes.POINTER(GUID), ctypes.byref(MF_MT_DEFAULT_STRIDE)), (ctypes.POINTER(wintypes.UINT), ctypes.byref(stride_u)))
        stride = ctypes.c_int32(stride_u.value).value if hr_st == 0 else width * 4
        abs_stride = abs(stride)

        while True:
            actual_idx = wintypes.DWORD(0)
            flags = wintypes.DWORD(0)
            ts = ctypes.c_int64(0)
            sample = ctypes.c_void_p()
            # IMFSourceReader::ReadSample = index 9
            hr = vtbl_call(
                reader, 9, ctypes.c_long,
                (wintypes.DWORD, MF_SOURCE_READER_FIRST_VIDEO_STREAM),
                (wintypes.DWORD, 0),
                (ctypes.POINTER(wintypes.DWORD), ctypes.byref(actual_idx)),
                (ctypes.POINTER(wintypes.DWORD), ctypes.byref(flags)),
                (ctypes.POINTER(ctypes.c_int64), ctypes.byref(ts)),
                (ctypes.POINTER(ctypes.c_void_p), ctypes.byref(sample)),
            )
            if hr != 0 or (flags.value & MF_SOURCE_READERF_ENDOFSTREAM):
                release(sample)
                break
            if not sample.value:
                continue

            buf = ctypes.c_void_p()
            try:
                # IMFSample::ConvertToContiguousBuffer = index 41 (IMFAttributes tem 33: 0..32)
                hr = vtbl_call(sample, 41, ctypes.c_long, (ctypes.POINTER(ctypes.c_void_p), ctypes.byref(buf)))
                if hr == 0 and buf.value:
                    data_ptr = ctypes.c_void_p()
                    max_len = wintypes.DWORD(0)
                    cur_len = wintypes.DWORD(0)
                    # IMFMediaBuffer::Lock = index 3
                    hr = vtbl_call(buf, 3, ctypes.c_long, (ctypes.POINTER(ctypes.c_void_p), ctypes.byref(data_ptr)), (ctypes.POINTER(wintypes.DWORD), ctypes.byref(max_len)), (ctypes.POINTER(wintypes.DWORD), ctypes.byref(cur_len)))
                    if hr == 0 and data_ptr.value and cur_len.value >= abs_stride * height:
                        raw = ctypes.string_at(data_ptr.value, abs_stride * height)
                        # RGB32 em MF é BGRX
                        im = Image.frombuffer("RGB", (width, height), raw, "raw", "BGRX", abs_stride, 1 if stride >= 0 else -1).copy()
                        frames.append(im)
                    # IMFMediaBuffer::Unlock = index 4
                    vtbl_call(buf, 4, ctypes.c_long)
            finally:
                release(buf)
                release(sample)
    finally:
        release(cur_type)
        release(mtype)
        release(reader)
        release(attrs)
        mfplat.MFShutdown()
        ole32.CoUninitialize()

    return frames, fps


def load_video_frames(video_path: Path):
    res = decode_video_ffmpeg(video_path)
    if res is not None:
        return res
    return decode_video_mf(video_path)


def load_sheet_frames(sheet_path: Path, count: int):
    im = Image.open(sheet_path).convert("RGB")
    w, h = im.size
    fw = w // count
    return [im.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(count)]


# ===================== Chroma Key Magenta + Despill + Erode + Feather =====================

def chroma_key_magenta(im_rgb: Image.Image) -> Image.Image:
    """Remove fundo magenta com chroma key, despill, erosão 1px e feather suave."""
    im = im_rgb.convert("RGB")
    w, h = im.size
    px = im.load()

    # Amostra cor de fundo nos 4 cantos para calibrar pequenas variações de compressão MP4
    corners = []
    for cx in (2, 8, w - 3, w - 9):
        for cy in (2, 8, h - 3, h - 9):
            if 0 <= cx < w and 0 <= cy < h:
                r, g, b = px[cx, cy]
                if min(r, b) - g > 30:
                    corners.append((r, g, b))
    if corners:
        bg_r = sum(c[0] for c in corners) / len(corners)
        bg_g = sum(c[1] for c in corners) / len(corners)
        bg_b = sum(c[2] for c in corners) / len(corners)
    else:
        bg_r, bg_g, bg_b = 255.0, 0.0, 255.0

    alpha = Image.new("L", (w, h), 255)
    apx = alpha.load()
    out_rgb = Image.new("RGB", (w, h))
    opx = out_rgb.load()

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # Excesso de magenta: ambos R e B acima de G
            rb_min = r if r < b else b
            mag_ex = rb_min - g
            # Distância de cor ao magenta dos cantos
            dr = r - bg_r
            dg = g - bg_g
            db = b - bg_b
            dist = math.sqrt(dr * dr + dg * dg + db * db)

            if mag_ex > 62 and dist < 175:
                a = 0
            elif mag_ex > 24 and dist < 210:
                # Transição suave (matte)
                t = (mag_ex - 24.0) / 38.0
                if t > 1.0:
                    t = 1.0
                a = int((1.0 - t) * 255)
            else:
                a = 255

            apx[x, y] = a

            # Despill: remove vazamento de magenta nas bordas/personagem
            if mag_ex > 8:
                # Reduz R e B proporcionalmente para neutralizar o tom roxo/magenta
                spill = min(mag_ex, 160)
                if a < 255 or mag_ex > 22:
                    nr = max(0, int(r - spill * 0.65))
                    nb = max(0, int(b - spill * 0.65))
                    ng = min(255, int(g + spill * 0.12))
                    opx[x, y] = (nr, ng, nb)
                else:
                    opx[x, y] = (r, g, b)
            else:
                opx[x, y] = (r, g, b)

    # Erode 1 px (MinFilter 3x3) para eliminar qualquer halo magenta externo
    alpha_eroded = alpha.filter(ImageFilter.MinFilter(3))
    # Feather suave nas bordas (GaussianBlur raio 0.65)
    alpha_feathered = alpha_eroded.filter(ImageFilter.GaussianBlur(radius=0.65))

    # Zera alpha onde já era 0 no erode para evitar névoa no fundo
    ae_px = alpha_eroded.load()
    af_px = alpha_feathered.load()
    for y in range(h):
        for x in range(w):
            if ae_px[x, y] < 8:
                af_px[x, y] = 0

    rgba = out_rgb.convert("RGBA")
    rgba.putalpha(alpha_feathered)
    return rgba


# ===================== Seleção de Ciclo Limpo em Vídeos =====================

def frame_signature(im: Image.Image):
    """Assinatura compacta 32x32 com máscara de foreground (ignora magenta)."""
    sm = im.resize((32, 32), Image.Resampling.BILINEAR)
    px = sm.load()
    sig = []
    for y in range(32):
        for x in range(32):
            r, g, b = px[x, y]
            mag = min(r, b) - g
            if mag > 45:
                sig.append((0, 0, 0, 0))
            else:
                sig.append((r, g, b, 255))
    return sig


def sig_diff(a, b) -> float:
    tot = 0.0
    for pa, pb in zip(a, b):
        # Peso maior na silhueta (alpha) + cor
        tot += abs(pa[3] - pb[3]) * 1.8 + abs(pa[0] - pb[0]) * 0.35 + abs(pa[1] - pb[1]) * 0.35 + abs(pa[2] - pb[2]) * 0.35
    return tot / len(a)


def select_cycle_frames(frames, fps: float, target_count: int, kind: str):
    n = len(frames)
    if n <= target_count:
        return frames[:target_count], 0, n - 1

    sigs = [frame_signature(f) for f in frames]

    if kind == "walk":
        # Busca o trecho [s, e] onde o frame e volta mais próximo à pose inicial s
        min_len = max(target_count + 2, int(round(fps * 0.45)))
        max_len = min(n - 1, int(round(fps * 1.65)))
        if max_len < min_len:
            min_len = target_count
            max_len = n - 1

        # Evita primeiros/últimos 2 frames caso o vídeo tenha fade ou pausa inicial
        margin = min(3, max(0, (n - min_len) // 4))
        best_score = 1e18
        best_pair = (margin, min(n - 1, margin + min_len))

        for s in range(margin, max(margin + 1, n - min_len)):
            for e in range(s + min_len, min(n, s + max_len + 1)):
                d = sig_diff(sigs[s], sigs[e])
                # Garante que há movimento real no meio do ciclo (não um trecho parado)
                mid = (s + e) // 2
                motion = sig_diff(sigs[s], sigs[mid])
                if motion < 6.0:
                    continue
                # Penaliza levemente ciclos excessivamente curtos ou longos
                score = d - min(motion, 40.0) * 0.15
                if score < best_score:
                    best_score = score
                    best_pair = (s, e)

        s, e = best_pair
        # Amostra `target_count` quadros em [s, e) (exclui `e` para não duplicar a pose de `s` no loop!)
        idxs = [s + int(round(i * (e - s) / target_count)) for i in range(target_count)]
        idxs = [min(n - 1, max(0, k)) for k in idxs]
        return [frames[k] for k in idxs], s, e
    else:
        # Ataque: encontra o trecho de maior atividade (pico de movimento) cobrindo a ação completa
        # Calcula energia de movimento frame a frame
        diffs = [0.0] + [sig_diff(sigs[i - 1], sigs[i]) for i in range(1, n)]
        win = min(n, max(target_count + 2, int(round(fps * 0.95))))
        best_s = 0
        best_energy = -1.0
        for s in range(0, max(1, n - win + 1)):
            en = sum(diffs[s:s + win])
            if en > best_energy:
                best_energy = en
                best_s = s
        e = min(n - 1, best_s + win - 1)
        idxs = [best_s + int(round(i * (e - best_s) / max(1, target_count - 1))) for i in range(target_count)]
        idxs = [min(n - 1, max(0, k)) for k in idxs]
        return [frames[k] for k in idxs], best_s, e


# ===================== Alinhamento pelos pés e Atlas =====================

def measure_char(rgba: Image.Image):
    """Retorna bbox (x0, y0, x1, y1) e centro X dos pés (faixa inferior 18%)."""
    w, h = rgba.size
    apx = rgba.getchannel("A").load()
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if apx[x, y] > 24:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < x0 or y1 < y0:
        return (0, 0, w - 1, h - 1, w / 2.0)

    # Centro horizontal ponderado na base (pés = 18% inferiores da altura do personagem)
    ch = max(1, y1 - y0 + 1)
    foot_y0 = max(y0, int(y1 - ch * 0.18))
    sx = 0.0
    cnt = 0
    for y in range(foot_y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if apx[x, y] > 24:
                sx += x
                cnt += 1
    foot_cx = (sx / cnt) if cnt > 0 else (x0 + x1) / 2.0
    return (x0, y0, x1, y1, foot_cx)


def build_atlas(rgba_frames, kind: str):
    """Uniformiza altura, alinha todos os quadros pelos pés e centro horizontal, e monta o atlas PNG."""
    # Altura de referência: mediana das alturas medidas para manter escala natural entre quadros
    metrics = [measure_char(fr) for fr in rgba_frames]
    heights = sorted([max(1, m[3] - m[1] + 1) for m in metrics])
    ref_h = heights[len(heights) // 2]
    scale = TARGET_CHAR_H / float(ref_h)

    scaled_items = []
    max_left = 0
    max_right = 0
    max_up = 0

    for fr, (x0, y0, x1, y1, foot_cx) in zip(rgba_frames, metrics):
        crop = fr.crop((x0, y0, x1 + 1, y1 + 1))
        cw, ch = crop.size
        nw = max(1, int(round(cw * scale)))
        nh = max(1, int(round(ch * scale)))
        resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        # Posição do centro dos pés dentro do quadro recortado/escalado
        rel_foot_x = (foot_cx - x0) * scale
        left_span = int(math.ceil(rel_foot_x))
        right_span = int(math.ceil(nw - rel_foot_x))
        if left_span > max_left: max_left = left_span
        if right_span > max_right: max_right = right_span
        if nh > max_up: max_up = nh
        scaled_items.append((resized, rel_foot_x, nh))

    half_w = max(max_left, max_right) + PAD_X
    cell_w = half_w * 2
    cell_h = max_up + PAD_TOP + PAD_BOT
    pivot_x = half_w
    pivot_y = cell_h - PAD_BOT  # Linha de base exata dos pés

    aligned = []
    rects = []
    atlas = Image.new("RGBA", (cell_w * len(scaled_items), cell_h), (0, 0, 0, 0))

    for idx, (im, rel_fx, nh) in enumerate(scaled_items):
        cell = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
        paste_x = int(round(pivot_x - rel_fx))
        paste_y = int(round(pivot_y - nh))
        cell.paste(im, (paste_x, paste_y), im)
        aligned.append(cell)
        atlas.paste(cell, (idx * cell_w, 0), cell)
        rects.append({"x": idx * cell_w, "y": 0, "w": cell_w, "h": cell_h})

    # Detecta o quadro de impacto do ataque (maior variação/extensão no meio do golpe, frames 2..n-2)
    impact_frame = 0
    if kind == "atk" and len(aligned) >= 3:
        best_i = len(aligned) // 2
        best_ext = -1
        for i in range(1, len(aligned) - 1):
            x0, y0, x1, y1, _ = measure_char(aligned[i])
            ext = (x1 - x0) + (y1 - y0) * 0.4
            if ext > best_ext:
                best_ext = ext
                best_i = i
        impact_frame = best_i

    return atlas, aligned, {
        "frameW": cell_w,
        "frameH": cell_h,
        "pivot": {"x": pivot_x, "y": pivot_y},
        "frames": rects,
        "impactFrame": impact_frame,
    }


def save_preview_gif(aligned_frames, out_gif: Path, fps: float):
    """Salva GIF de prévia sobre fundo escuro do jogo para conferência visual de chroma e alinhamento."""
    bg_col = (24, 42, 36, 255)
    gif_frames = []
    dur_ms = max(40, int(round(1000.0 / fps)))
    for fr in aligned_frames:
        bg = Image.new("RGBA", fr.size, bg_col)
        bg.alpha_composite(fr)
        gif_frames.append(bg.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))
    gif_frames[0].save(
        out_gif,
        save_all=True,
        append_images=gif_frames[1:],
        duration=dur_ms,
        loop=0,
        optimize=True,
    )


# ===================== Descoberta e Processamento =====================

def discover_sources(filter_id: str = ""):
    if not ANIM_DIR.exists():
        return []
    found = {}
    pat = re.compile(r"^(e_[a-zA-Z0-9]+)_(walk|atk)(_sheet)?\.(mp4|png)$", re.IGNORECASE)
    for f in sorted(ANIM_DIR.iterdir()):
        if not f.is_file():
            continue
        m = pat.match(f.name)
        if not m:
            continue
        eid, state, is_sheet, ext = m.group(1), m.group(2).lower(), bool(m.group(3)), m.group(4).lower()
        if filter_id and eid != filter_id:
            continue
        key = (eid, state)
        # Prefere folha se ambos existirem? Ou vídeo se não houver folha
        if key not in found or is_sheet:
            found[key] = (f, "sheet" if is_sheet or ext == "png" else "video")
    return sorted(found.items())


def process_one(eid: str, state: str, src_path: Path, src_kind: str):
    target_count = 8 if state == "walk" else 6
    default_fps = 10.0 if state == "walk" else 12.0
    print(f"[{eid}_{state}] Lendo {src_path.name} ({src_kind})...")

    if src_kind == "video":
        raw_frames, v_fps = load_video_frames(src_path)
        if not raw_frames:
            raise RuntimeError(f"Nenhum quadro decodificado de {src_path}")
        selected, s_idx, e_idx = select_cycle_frames(raw_frames, v_fps, target_count, state)
        print(f"  -> {len(raw_frames)} quadros ({v_fps:.1f} fps) | ciclo [{s_idx}..{e_idx}] -> {len(selected)} quadros extraidos")
    else:
        selected = load_sheet_frames(src_path, target_count)
        print(f"  -> Folha cortada em {len(selected)} quadros")

    rgba_frames = [chroma_key_magenta(f) for f in selected]
    atlas, aligned, meta = build_atlas(rgba_frames, state)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png_name = f"{eid}_{state}.png"
    json_name = f"{eid}_{state}.json"
    gif_name = f"preview_{eid}_{state}.gif"

    atlas.save(OUT_DIR / png_name, optimize=True)
    meta_out = {
        "id": eid,
        "state": state,
        "image": f"img/anim/{png_name}",
        "fps": default_fps,
        "loop": state == "walk",
        **meta,
    }
    (OUT_DIR / json_name).write_text(json.dumps(meta_out, indent=2), encoding="utf-8")
    save_preview_gif(aligned, OUT_DIR / gif_name, default_fps)

    print(
        f"  -> Gerado: img/anim/{png_name} ({atlas.width}x{atlas.height}, "
        f"celula {meta['frameW']}x{meta['frameH']}, pivo {meta['pivot']['x']},{meta['pivot']['y']}"
        + (f", impacto frame #{meta['impactFrame']}" if state == "atk" else "")
        + f") + {gif_name}"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", default="", help="Processar apenas um inimigo (ex: e_g)")
    args = ap.parse_args()

    sources = discover_sources(args.id)
    if not sources:
        print("Nenhum arquivo encontrado em anim/ (esperado: e_<id>_walk.mp4 / e_<id>_atk.mp4 ou _sheet.png).")
        return 1

    for (eid, state), (path, kind) in sources:
        process_one(eid, state, path, kind)

    # Gera img/anim/index.json com todos os atlas existentes para descoberta automática no jogo
    if OUT_DIR.exists():
        idx_map = {}
        pat_j = re.compile(r"^(e_[a-zA-Z0-9]+)_(walk|atk)\.json$")
        for jf in sorted(OUT_DIR.glob("*.json")):
            if jf.name == "index.json":
                continue
            m = pat_j.match(jf.name)
            if not m:
                continue
            eid, st = m.group(1), m.group(2)
            idx_map.setdefault(eid, {})[st] = f"img/anim/{jf.name}"
        (OUT_DIR / "index.json").write_text(json.dumps(idx_map, indent=2), encoding="utf-8")
        print(f"Indice atualizado: img/anim/index.json ({len(idx_map)} inimigo(s))")

    print("Concluido!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
