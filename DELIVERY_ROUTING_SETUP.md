# OSRM delivery routing setup

Online Bar calls the OSRM HTTP API for road-distance dispatch ranking and road-route overlays in the Delivery command centre. The map itself uses OpenStreetMap-backed tiles; OSRM supplies routable roads, distances, durations, and route geometry. The OSRM engine must run as a separate service from the Next.js application.

## Run an OSRM service for Kenya

The official implementation is [Project OSRM's `osrm-backend` repository](https://github.com/Project-OSRM/osrm-backend). Its published container is the quickest way to run the same upstream code without adding the C++ source tree to this Next.js repository.

On a Linux host or VM with Docker and enough memory and disk space:

```sh
mkdir -p ~/onlinebar-osrm/data
cd ~/onlinebar-osrm/data
wget https://download.geofabrik.de/africa/kenya-latest.osm.pbf
docker pull ghcr.io/project-osrm/osrm-backend:latest
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/kenya-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/kenya-latest.osrm
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/kenya-latest.osrm
docker run -d --restart unless-stopped --name onlinebar-osrm -p 5000:5000 -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld --ip 0.0.0.0 --port 5000 /data/kenya-latest.osrm
```

Keep the processed `.osrm*` files on persistent storage. Preprocessing is a one-time operation for each new OSM extract; repeat it when updating road data. Do not run preprocessing on every web request or application startup.

For production, put the routing service behind HTTPS and restrict access to the Online Bar application. The OSRM HTTP API does not provide application authentication by itself; do not expose an unrestricted routing service to the public internet. If the hosting provider supports private service networking, use its private URL.

## Connect Online Bar

Set this server-only environment variable in `.env.local` for development and in the Online Bar Render service's private Environment settings for production:

```env
OSRM_BASE_URL=https://your-private-routing-host
```

Use the service base URL only: no `/route/v1/...` or `/table/v1/...` suffix. Restart the local app or redeploy after setting it. The app uses OSRM's `route` service to draw an assigned rider's path to the customer and its `table` service to compare fresh rider GPS positions with merchant pickup locations. If OSRM is not configured or cannot return a road path, the dispatch UI reports the problem and does not label a straight-line estimate as a road route.

## Operational limits

- The configured OSRM dataset uses the `car.lua` profile, which is a road-network estimate, not a motorcycle-specific or traffic-aware ETA. Durations do not include live traffic, pickup time, merchant wait, or delivery handover time.
- OSRM routing estimates are not billing or rider-pay amounts. Do not use these values as actual fuel consumption or payout records.
- The dispatch matrix uses fresh verified rider GPS (at most five minutes old) and supports up to 50 rider origins per calculation batch. No route is shown when coordinates are missing or outside the extract's routable coverage.
- The displayed basemap includes OpenStreetMap contributors. Preserve required OpenStreetMap attribution when changing map tiles.
- Use the OSRM `nearest`, `match`, or `trip` services only when the corresponding operational workflow has been implemented and tested; this integration currently uses `route` and `table`.
