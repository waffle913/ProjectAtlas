import { existsSync, readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('src/data/population-source-manifest.json', 'utf8')); const raster = process.env.PROJECTATLAS_WORLDPOP_RASTER ?? '.cache/population/worldpop-r2025a-1km.tif';
if (!existsSync(raster)) throw new Error(`Pinned WorldPop raster is required at ${raster}. Acquire ${manifest.worldPopSource.productId}, verify SHA-256, then rerun.`);
throw new Error('Raster detected, but no reviewed GDAL zonal-statistics output was supplied. Complete the documented overlap/gap audit before replacing compact weights.');
