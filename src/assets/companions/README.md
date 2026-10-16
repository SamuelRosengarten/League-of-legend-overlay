# Companion art

`gwen.png` and `amumu.png` are cut from the reference sheet
`Chibi Seamstress and Sad Mummy Duo.png` (project root, supplied by the project owner).
The sheet already has a real alpha channel with a fully transparent gap between the two
characters (columns ~870–990 of 1690), so the split is lossless:

1. Alpha-tight bounding box per character (alpha > 8), plus 6 px padding.
2. High-quality bicubic resize in premultiplied alpha (no dark fringes): Gwen 759×879 → 414×480,
   Amumu 615×722 → 358×420. That is about 2.5× their display size on a 200 % display at the
   default companion size.

`fiddlesticks.svg` is not from the sheet: it is hand-drawn vector art (viewBox 360×440) in the same chibi style, so it scales cleanly at any size.

The art is fan art inspired by the champions. It is not official Riot artwork.

## How the overlay uses it

`src/ui/companions/sprites.ts` describes each sprite in fractions (0–1) of its width and height:

| Field | Purpose |
| --- | --- |
| `eyes` | Center, size and tilt of each eye. Eyelid overlays sit here for blinking, winks, sleepy and happy (∩) eyes. |
| `lid`, `lash` | Eyelid colors sampled from the art (Gwen's skin, Amumu's bandages). |
| `seat` | Where the feet or bottom rest on the frame when perching. |
| `peek` | How much of the sprite shows above the border when peeking (head and eyes). |
| `hangAt` | Where Gwen's ribbon, Amumu's bandage or Fiddlesticks' rope ties on when hanging below the panel. |
| `sparkles`, `bubble` | Anchors for sparkles (Gwen's scissor gem, blade tip) and the expression bubble. |

## Replacing the art

Replace the PNG with any transparent image, then update `width` and `height` to its pixel
size and re-measure `eyes`, `seat`, `peek` and `hangAt`. A quick way to check the eye boxes
is to draw them over the image. If the eyelids sit in the wrong place, blinking will look off.
