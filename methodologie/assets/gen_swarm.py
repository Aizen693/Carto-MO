"""Generate Algor Int "tentacular biological" network image.

Croissance fractale type L-system : chaque hub pousse des branches qui se
ramifient recursivement (sub-branches qui se ramifient encore). Variations
fortes en longueur, densite, epaisseur -> look vivant / plante / ramifications.
Violet sur noir, pas de copyright.
"""
import random
import math
import numpy as np
import matplotlib.pyplot as plt

random.seed(31)
np.random.seed(31)

# === Hubs repartis sur TOUT le cadre, mais avec tailles tres heterogenes ===
#   Plein cadre + densite variable. Aucune zone du cadre n'est completement vide,
#   mais certaines zones sont denses (gros hubs proches) et d'autres aerees.
HUBS = [
    (-1.80,  0.70),   # 0
    (-1.50, -0.70),   # 1
    (-1.00,  0.20),   # 2
    (-0.50, -1.05),   # 3
    (-0.20,  0.95),   # 4
    ( 0.20, -0.30),   # 5
    ( 0.60,  0.55),   # 6
    ( 0.85, -1.10),   # 7
    ( 1.20,  0.10),   # 8
    ( 1.55,  1.00),   # 9
    ( 1.75, -0.65),   # 10
]

# Tailles tres variees : 3 gros, 3 moyens, 5 petits — donne le contraste
HUB_SIZES    = [1.60, 0.55, 0.95, 0.45, 1.30, 0.80, 1.50, 0.50, 1.10, 0.65, 0.85]
HUB_BRANCHES = [18,    8,  14,    7,  17,  12,   18,    7,  15,   9,  12]

HUB_LINKS = [
    (0, 2), (1, 2), (0, 1),       # cluster gauche
    (2, 3), (2, 4), (2, 5),       # rayonne vers centre
    (3, 5), (4, 5), (4, 6),       # pont centre
    (5, 6), (5, 7), (5, 8),       # centre vers droite
    (6, 8), (6, 9), (7, 8),       # cluster droit
    (8, 9), (8, 10), (9, 10),     # haut-droite et bas-droite
    (0, 4), (1, 3), (3, 7),       # longues diagonales
]

# === Setup figure ===
fig, ax = plt.subplots(figsize=(16, 12), dpi=140, facecolor='#06030F')
ax.set_facecolor('#06030F')
ax.set_aspect('equal')

# === Collecteurs pour render groupe ===
lines_xs, lines_ys, lines_lw, lines_al = [], [], [], []
dots_x, dots_y, dots_s, dots_a = [], [], [], []

def grow_branch(x, y, angle, length, thickness, depth, alpha, max_depth=6):
    """Recursive plant-like growth with HIGH branching probability."""
    if depth > max_depth or length < 0.03:
        return
    step = 0.022 + random.uniform(0, 0.014)
    n_steps = max(3, int(length / step))
    angle_drift_bias = random.uniform(-0.05, 0.05)
    # Probabilite de ramification ELEVEE — c'est ce qui donne le look "plante touffue"
    branch_prob = max(0.05, 0.30 - depth * 0.04)

    path_xs, path_ys = [x], [y]
    cx, cy = x, y
    cur_angle = angle

    for i in range(n_steps):
        # Mini-derive aleatoire + biais constant -> courbure
        cur_angle += angle_drift_bias + random.uniform(-0.18, 0.18)
        cx += math.cos(cur_angle) * step
        cy += math.sin(cur_angle) * step
        path_xs.append(cx); path_ys.append(cy)

        # Dot a cette position
        prog = i / n_steps
        dot_alpha = alpha * (0.95 - 0.55 * prog)
        dot_size = max(1.5, thickness * (1.4 - 0.65 * prog) * 3.5)
        dots_x.append(cx); dots_y.append(cy)
        dots_s.append(dot_size); dots_a.append(dot_alpha)

        # Ramification ? Probabilite elevee + parfois DOUBLE branche (Y-fork)
        if random.random() < branch_prob and depth < max_depth:
            # Decider : Y-fork (2 branches symetriques) ou simple branche
            do_fork = random.random() < 0.35 and depth < max_depth - 1
            if do_fork:
                # Y-fork : 2 sous-branches symetriques
                fork_angle = random.uniform(0.45, 0.85)
                for side in (-1, 1):
                    sub_length = length * random.uniform(0.50, 0.75)
                    grow_branch(cx, cy, cur_angle + side * fork_angle,
                                sub_length, thickness * 0.80,
                                depth + 1, alpha * 0.88, max_depth)
            else:
                side = random.choice([-1, 1])
                branch_angle = cur_angle + side * random.uniform(0.4, 1.1)
                sub_length = length * random.uniform(0.40, 0.70)
                grow_branch(cx, cy, branch_angle, sub_length, thickness * 0.78,
                            depth + 1, alpha * 0.88, max_depth)

    # Ligne de la branche (faible mais visible — on stocke pour render groupe)
    lines_xs.append(path_xs); lines_ys.append(path_ys)
    lines_lw.append(max(0.20, thickness * 0.55))
    lines_al.append(alpha * 0.32)

# === Bruit de fond — courbes errantes pour densifier ===
for _ in range(120):
    x1 = random.uniform(-2.3, 2.3); y1 = random.uniform(-1.6, 1.6)
    angle = random.uniform(0, 2 * math.pi)
    length = random.uniform(0.4, 1.6)
    x2 = x1 + math.cos(angle) * length
    y2 = y1 + math.sin(angle) * length
    midx = (x1 + x2) / 2 + random.uniform(-0.3, 0.3)
    midy = (y1 + y2) / 2 + random.uniform(-0.3, 0.3)
    ts = np.linspace(0, 1, 28)
    xs = (1-ts)**2 * x1 + 2*(1-ts)*ts * midx + ts**2 * x2
    ys = (1-ts)**2 * y1 + 2*(1-ts)*ts * midy + ts**2 * y2
    ax.plot(xs, ys, color='#A07AE8',
            linewidth=random.uniform(0.16, 0.34),
            alpha=random.uniform(0.04, 0.11),
            zorder=1)

# === Liens inter-hubs ===
for a, b in HUB_LINKS:
    p1 = HUBS[a]; p2 = HUBS[b]
    midx = (p1[0] + p2[0]) / 2 + random.uniform(-0.4, 0.4)
    midy = (p1[1] + p2[1]) / 2 + random.uniform(-0.4, 0.4)
    ts = np.linspace(0, 1, 60)
    xs = (1-ts)**2 * p1[0] + 2*(1-ts)*ts * midx + ts**2 * p2[0]
    ys = (1-ts)**2 * p1[1] + 2*(1-ts)*ts * midy + ts**2 * p2[1]
    ax.plot(xs, ys, color='#C9A8FF', linewidth=0.5, alpha=0.22, zorder=2)

# === HUBS — chacun pousse N branches principales (variation forte) ===
for hub_idx, (hx, hy) in enumerate(HUBS):
    n_branches = HUB_BRANCHES[hub_idx]
    global_size = HUB_SIZES[hub_idx]

    # Angles de depart : repartis autour du hub mais avec variation
    base_angles = [(i / n_branches) * 2 * math.pi + random.uniform(-0.30, 0.30)
                   for i in range(n_branches)]
    random.shuffle(base_angles)

    for ang in base_angles:
        # Longueur amplifiee + variation ; gros hubs s'etendent loin
        length = random.uniform(0.35, 0.80) * global_size
        thickness = random.uniform(0.7, 1.4) * (0.7 + 0.5 * global_size)
        alpha = random.uniform(0.65, 1.0)
        # Profondeur de ramification — TRES profonde pour effet plante touffue
        if global_size > 1.2:
            depths = [5, 5, 6, 6]
        elif global_size > 0.7:
            depths = [4, 4, 5]
        else:
            depths = [3, 3, 4]
        grow_branch(hx, hy, ang, length, thickness, depth=0, alpha=alpha,
                    max_depth=random.choice(depths))

# === Render lignes des branches en groupe ===
for xs, ys, lw, al in zip(lines_xs, lines_ys, lines_lw, lines_al):
    ax.plot(xs, ys, color='#9D7AE8', linewidth=lw, alpha=al, zorder=3)

# === Render dots des branches — par tranches d'alpha ===
dots_x = np.array(dots_x); dots_y = np.array(dots_y)
dots_s = np.array(dots_s); dots_a = np.array(dots_a)
buckets = [(0.85, 0.60), (0.60, 0.40), (0.40, 0.20), (0.20, 0.05)]
for hi, lo in buckets:
    mask = (dots_a >= lo) & (dots_a < hi)
    if mask.any():
        ax.scatter(dots_x[mask], dots_y[mask], s=dots_s[mask],
                   c='#D3B4FF', alpha=(hi + lo) / 2,
                   edgecolors='none', zorder=4)

# === Poussiere de dots libres (densite elevee, reparti partout) ===
n_scatter = 450
sx = np.random.uniform(-2.2, 2.2, n_scatter)
sy = np.random.uniform(-1.5, 1.5, n_scatter)
ax.scatter(sx, sy, s=np.random.uniform(1, 3.5, n_scatter),
           c='#B392F0', alpha=np.random.uniform(0.15, 0.45, n_scatter),
           edgecolors='none', zorder=3)

# === Hubs : halo bloom + coeur blanc (taille proportionnelle a HUB_SIZES) ===
hub_x = [h[0] for h in HUBS]; hub_y = [h[1] for h in HUBS]
halo_outer = [1100 * s for s in HUB_SIZES]
halo_mid   = [ 450 * s for s in HUB_SIZES]
halo_in    = [ 140 * s for s in HUB_SIZES]
core_sz    = [ max(15, 40 * s) for s in HUB_SIZES]
ax.scatter(hub_x, hub_y, s=halo_outer, c='#7B5DD1', alpha=0.22, edgecolors='none', zorder=5)
ax.scatter(hub_x, hub_y, s=halo_mid,   c='#9D7AE8', alpha=0.40, edgecolors='none', zorder=6)
ax.scatter(hub_x, hub_y, s=halo_in,    c='#C9A8FF', alpha=0.80, edgecolors='none', zorder=7)
ax.scatter(hub_x, hub_y, s=core_sz,    c='#FFFFFF', alpha=1.0,  edgecolors='none', zorder=8)

# === Cleanup ===
ax.set_xlim(-2.2, 2.2); ax.set_ylim(-1.5, 1.5)
ax.set_xticks([]); ax.set_yticks([])
for spine in ax.spines.values():
    spine.set_visible(False)

plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
plt.savefig('/tmp/swarm-algorint.png', dpi=140, facecolor='#06030F',
            bbox_inches='tight', pad_inches=0)
print('Saved /tmp/swarm-algorint.png')
