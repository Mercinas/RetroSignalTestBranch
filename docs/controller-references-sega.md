# Sega controller drawing references

The new inline SVG in `manager/controller-layouts/art-sega.js` is an original,
unbranded drawing. It uses the following photographs of original hardware as
visual references. Each photograph was downloaded to the local review directory
and inspected, rather than relying on search descriptions alone.

| Systems / variant | Primary visual reference | Features carried into the drawing |
| --- | --- | --- |
| Master System | [Evan-Amos: original Control Pads](https://commons.wikimedia.org/wiki/File:Sega-Master-System-Controllers.jpg) | Rectangular shell, square rounded flat directional disc, stepped face plate, red button strips, two round face buttons. Pause is a separately labeled console control. |
| Genesis, Sega CD, 32X / three-button | [Evan-Amos: Genesis three-button pad](https://commons.wikimedia.org/wiki/File:Sega-Genesis-3But-Cont.jpg) | Broad crescent shell, round directional recess, ABC arc and Start above it; no XYZ or Mode on this variant. |
| Genesis, Sega CD, 32X / six-button | [Evan-Amos: Genesis six-button pad](https://commons.wikimedia.org/wiki/File:Sega-Genesis-6But-Cont.jpg) | Smaller scalloped shell, circular right button field, smaller XYZ above larger ABC, central Start. Mode appears in a top-edge callout. |
| Saturn / standard | [Evan-Amos: North American Model 2](https://commons.wikimedia.org/wiki/File:Sega-Saturn-Controller-NA-Mk-II-FL.jpg) | Curved shallow grips, glossy inset, round directional pad, six-button arc with larger ABC and lower central Start. L/R are top-edge controls. The drawing's model name distinguishes this original Sega model from the different North American launch pad. |
| Game Gear | [Evan-Amos: original black handheld](https://commons.wikimedia.org/wiki/File:Game-Gear-Handheld_(cropped).jpg) | Wide rounded shell, tapering screen surround, round left directional pad, lower-left speaker grille, diagonal 1/2 and blue Start above them. |

These are primary hardware photographs, published by their photographer with a
public-domain dedication. Their pixels are review material only, not embedded
in the shipped UI. The vectors intentionally omit product logos.

The [1995 Sega Saturn manufacturer instruction manual](https://archive.org/details/Sega_Saturn_Instruction_Manual_1995_Sega_US)
also identifies the standard pad's controls. Existing EJS input indices are
preserved; artwork does not establish core routing or physical controller tests.

The existing Saturn analog variant remains explicitly marked **schematic,
device routing unverified**. It is not a newly supported device and is not
presented as an accepted exact reconstruction of its separate 3D pad hardware.

Validation: syntax check and complete input-ID/geometry coverage passed for
all ten Sega system/variant combinations, with physical footprints contained
inside the 600 by 340 coordinate space. Integration owns interactive hit areas,
keyboard mapping state and responsive popup verification.
