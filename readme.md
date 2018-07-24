<p align="center">
  <img src="https://github.com/oframe/ibl-converter/raw/master/src/assets/ui/instructions.jpg" alt="O-GL" width="800" />
</p>
<br />

<h1 align="center">IBL Converter For PBR</h1>


<p align="center"><b>Generate IBL maps for use with PBR shaders.</b></p>

<br />
<br />

Use this to convert different environment maps into the required formats for use in a PBR render.

[Link here](https://oframe.github.io/ibl-converter/)

## Overview

Drag and drop an equirectangular environment map to generate the two necessary textures for adding Image Based Lighting to PBR shaders.

Made for use with the [OGL PBR example](https://oframe.github.io/ogl/examples/?src=pbr.html) shader, however can be plugged into any framework.

### Supported input types: 
 - *.hdr (Radiance/RGBE)*, which outputs a *.png* in *RGBM* format. This conversion takes the HDR (high dynamic range) values  and converts them into the RGBA channels of an 8bit PNG (8bit per channel = 32bits); the output PNG will likely look mostly transparent when previewed directly.

 - *.jpg/.png (sRGB)* bitmap, which outputs a *.png* in *sRGB* format. This is an SDR (standard dynamic range) format.

 ### Output files:
 - Irradiance Diffuse Map. Currently outputting at 128x64, however can likely go smaller with no quality drop. This map is pre-filtered and hence looks very blurry. It gives the average diffuse lighting in a given direction.

 - Radiance Specular Map Atlas. Currently set at 512x512, which is ok for most cases but not close-up reflections. If wished, this setting can be increased in Specular.js. This map is an atlas made up of 7 sequentially prefiltered renders, each half the size of the previous - used to simulate varying roughness levels in the PBR render. The renders are stacked vertically, with the bottom half of the texture being the first, non-filtered level.

When you hit the download prompt, the two maps will be downloaded to your local file system. The downloaded files use the following naming structure:
```
[input filename]-[map type]-[output format].png
```
eg. _**sky-diffuse-RGBM.png**_ and _**sky-specular-RGBM.png**_

## TODO
 - feature small library of pre-generated maps
 - Support .exr input format
 - Reduce artifacts at the poles
 - Allow user to select output type