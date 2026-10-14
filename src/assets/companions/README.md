# Companion art

Gwen and Amumu are drawn by default with the built-in vector art in
`src/ui/companions/art.ts`. That art is original and fan-made, inspired by the champions.
It is **not** official Riot artwork.

To use your own raster art instead, drop transparent PNG or WebP files here:

```
src/assets/companions/gwen/sit.webp     (or .png)
src/assets/companions/gwen/stand.webp
src/assets/companions/gwen/peek.webp
src/assets/companions/gwen/hang.webp
src/assets/companions/amumu/sit.webp
src/assets/companions/amumu/peek.webp
src/assets/companions/amumu/hang.webp
```

Each file replaces one pose and is picked up automatically at build time. Poses without a
file keep the vector art. The image is stretched to the pose's box, so match its aspect
ratio. The **seat line** is the panel border the companion sits on or hangs from:

| Pose | Aspect (w × h) | Seat line, from the top | Notes |
| --- | --- | --- | --- |
| gwen/sit | 72 × 96 | 79 % | Sits on the top border; legs dangle below the line |
| gwen/stand | 72 × 96 | 96 % | Feet on the top border |
| gwen/peek | 72 × 52 | 88 % | Only head and hands above the line |
| gwen/hang | 72 × 96 | 8 % | Hands on the bottom border, body hangs below |
| amumu/sit | 78 × 68 | 88 % | Sits on the top border (Amumu has no stand pose) |
| amumu/peek | 78 × 52 | 88 % | |
| amumu/hang | 78 × 72 | 11 % | |

Export at 4× the box size (e.g. 288 × 384 for gwen/sit) for crisp results on 200 % displays.
Raster art is shown static: the idle animations only animate the vector parts.
