<p align="center">
  <img src="https://github.com/oframe/ibl-converter/raw/master/src/assets/ui/instructions.jpg" alt="O-GL" width="510" />
</p>

<h1 align="center">IBL Converter For PBR</h1>


<p align="center"><b>Generate IBL maps for use with PBR shaders.</b></p>

<br />

Use this to convert different environment maps into the required formats for use in a PBR render.

[Link here](https://oframe.github.io/ibl-converter)

Drag and drop an equirectangular environment map to generate the two necessary textures to add Image Based Lighting in PBR shaders.

Made for use with the OGL PBR example shader, however can be plugged into any framework.

Currently supported input types: 
 - .hdr (Radiance), which outputs a .png in RGBM format. This conversion takes the HDR (high dynamic range) values  and converts them into the RGBA channels of an 8bit PNG (8bit per channel = 32bits); the output PNG will likely look mostly transparent when previewed directly.
 - .jpg/.png (sRGB) bitmap, which outputs a .png in sRGB format. This is an SDR (standard dynamic range) format.

When you hit the download prompt, two maps will be downloaded to your local system. The downloaded files use the following file naming syntax:
```
[input filename]-[map type]-[output format].png
```
eg. sky-diffuse-RGBM.png and sky-specular-RGBM.png

Output files:
 - Irradiance Diffuse Map. Currently outputting at 128x64, however can likely go smaller with no quality drop. This map is pre-filtered and hence looks very blurry. It gives the average diffuse lighting in a given direction.
 - Radiance Specular Map Atlas. Currently set at 512x512, which is ok for most cases but not close-up reflections. If wished, this setting can be increased in Specular.js. This map is an atlas made up of 7 sequentially prefiltered renders, each half the size of the previous - used to simulate varying roughness levels in the PBR render. The renders are stacked vertically, with the bottom half of the texture being the first, non-filtered level.