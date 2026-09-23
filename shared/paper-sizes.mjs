export const paperSizes = {
  'Letter':[215.9,279.4], 'Legal':[215.9,355.6], 'Executive':[184.15,266.7],
  'A4':[210,297], 'A5':[148,210], 'A5 landscape':[210,148],
  'A6':[105,148], 'A6 landscape':[148,105],
  'B5 (ISO)':[176,250], 'B5 (JIS)':[182,257],
  'B6 (ISO)':[125,176], 'B6 landscape (ISO)':[176,125],
  'B6 (JIS)':[128,182], 'B6 landscape (JIS)':[182,128],
  'C5':[162,229], 'C6':[114,162], 'C6 landscape':[162,114],
  'Business Card':[55,91],
  '8.5 x 17 inch':[215.9,431.8], '8.5 x 34 inch':[215.9,863.6],
  '8.5 x 106.3 inch':[215.9,2700.02], '8.5 x 160 inch':[215.9,4064],
  '8.5 x 215 inch':[215.9,5461], '8.5 x 220 inch':[215.9,5588],
};
export function paperDimensions(size) {
  if (Object.hasOwn(paperSizes, size)) return paperSizes[size];
  const custom = /^Custom: (\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm$/.exec(size);
  if (custom) {
    const width = Number(custom[1]), height = Number(custom[2]);
    if (width >= 25 && width <= 216 && height >= 25 && height <= 5588) return [width,height];
  }
  throw new Error('Invalid paper size. Custom dimensions must be 25–216 mm wide and 25–5588 mm high.');
}
export function scannerPaperSize(size) {
  const [width,height] = paperDimensions(size);
  return `${width}x${height}mm`;
}
