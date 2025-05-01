import React, { useState, useEffect, useRef, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// signature timeline segments
const timelineSegments = [
  { id: 'archaic',     label: 'Archaic & Early', start: -800, end: -480,
    tags: ['Archaic','Late Archaic','Peisistratid'] },
  { id: 'classical',   label: 'Classical',       start: -480, end: -323,
    tags: ['Early Classical','Periclean','Classical','Lycurgan Period','Late Classical'] },
  { id: 'hellenistic', label: 'Hellenistic',     start: -323, end: -30,
    tags: ['Hellenistic','Early Hellenistic','Late Hellenistic','Seleucid','Ptolemaic','Pergamene'] },
  { id: 'republican',  label: 'Republican',      start: -509, end: -27,
    tags: ['Early Republican','Middle Republican','Late Republican','Republican','Sullan','Caesarian Period','Triumviral Period'] },
  { id: 'earlyEmpire', label: 'Early Empire',    start: -27,  end: 192,
    tags: ['Augustan','Tiberian','Julio-Claudian','Flavian','Nerva–Trajanian','Hadrian','Antonine'] },
  { id: 'lateEmpire',  label: 'Late Empire',     start: 193,  end: 476,
    tags: ['Severan','Crisis of 3rd Century','Diocletian-Tetrarch','Constantinian','Late Roman','Late Antique'] },
];

// compute total span
const MIN_YEAR = Math.min(...timelineSegments.map(s => s.start));
const MAX_YEAR = Math.max(...timelineSegments.map(s => s.end));
const TOTAL_SPAN = MAX_YEAR - MIN_YEAR;
const PANEL_WIDTH = 400;
const TIMELINE_MARGIN = 50;

// allowed morphology filter values
const allowedMorphologies = [
  'prostyle', 'amphiprostyle', 'pseudoperipteral', 'peripteral', 'dipteral',
  'pseudodipteral', 'distyle in antis', 'tetrastyle', 'hexastyle',
  'octastyle', 'nonastyle', 'peristyle', 'linear', 'U-shape', 'L-shape'
];

const buttonStyle = {
  margin: 4, padding: '8px 14px', border: 'none', borderRadius: '6px',
  cursor: 'pointer', transition: 'background 0.3s, color 0.3s', fontSize: '0.9rem'
};
const headerStyle = {
  ...buttonStyle, background: '#f0f0f0', color: '#333', fontWeight: 'bold'
};

export default function SiteMap() {
  const mapContainer = useRef(null), map = useRef(null);

  const [data, setData] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  // we key selection by the unique doc_id now
  const [selectedBuildingDocId, setSelectedBuildingDocId] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [hoveredSegment, setHoveredSegment] = useState(null);

  const [filters, setFilters] = useState({
    order: new Set(),
    morphology: new Set(),
    age: new Set(),
  });
  const [dropdownOpen, setDropdownOpen] = useState({
    order: false,
    morphology: false,
    age: false,
  });

  const inactiveColor = '#aaa';
  const activeColor = '#007cbf';

  // load GeoJSON
  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/sites.geojson`)
      .then(r => r.json())
      .then(raw => {
        raw.features.forEach(f =>
          f.properties.buildings.forEach(b =>
            ['order','morphology','age','date'].forEach(attr => {
              if (Array.isArray(b[attr])) {
                b[attr] = b[attr].filter(v =>
                  v && v.toLowerCase() !== 'undetermined' && v !== '<NA>'
                );
              }
            })
          )
        );
        setData(raw);
      })
      .catch(console.error);
  }, []);

  // initialize Mapbox
  useEffect(() => {
    if (!data || map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [18.0, 40.0],
      zoom: 5
    });
    map.current.on('load', () => {
      map.current.addSource('sites', { type: 'geojson', data });
      map.current.addLayer({
        id: 'sites-layer',
        type: 'circle',
        source: 'sites',
        paint: { 'circle-radius': 6, 'circle-color': '#007cbf' }
      });
      map.current.on('click', 'sites-layer', e => {
        setSelectedSite(e.features[0].properties.site);
        setSelectedBuildingDocId(null);
      });
      map.current.on('mouseenter', 'sites-layer', () =>
        map.current.getCanvas().style.cursor = 'pointer'
      );
      map.current.on('mouseleave', 'sites-layer', () =>
        map.current.getCanvas().style.cursor = ''
      );
    });
  }, [data]);

  // highlight selected site
  useEffect(() => {
    if (!map.current) return;
    const expr = ['case',
      ['==',['get','site'],selectedSite], '#FF4136',
      '#007cbf'
    ];
    if (map.current.getLayer('sites-layer')) {
      map.current.setPaintProperty('sites-layer','circle-color',expr);
    }
  }, [selectedSite]);

  // compute filter options
  const allOptions = useMemo(() => {
    if (!data) return { order: [], morphology: [], age: [] };
    const o = new Set(), m = new Set(), a = new Set();
    data.features.forEach(f =>
      f.properties.buildings.forEach(b => {
        b.order.forEach(v => o.add(v));
        b.morphology.forEach(v => m.add(v));
        b.age.forEach(v => a.add(v));
      })
    );
    return {
      order: Array.from(o).sort(),
      morphology: Array.from(m).filter(v =>
        allowedMorphologies.includes(v)
      ).sort(),
      age: Array.from(a).sort()
    };
  }, [data]);

  // apply attribute & period filters
  const filteredData = useMemo(() => {
    if (!data) return { type: 'FeatureCollection', features: [] };
    const periodTags = selectedPeriod
      ? new Set(timelineSegments.find(s => s.id === selectedPeriod).tags)
      : null;
    return {
      type: 'FeatureCollection',
      features: data.features.map(f => {
        const bs = f.properties.buildings.filter(b => {
          for (let attr of ['order','morphology','age']) {
            const set = filters[attr];
            if (set.size && ![...set].some(v => b[attr].includes(v))) return false;
          }
          if (periodTags && !b.age.some(tag => periodTags.has(tag))) return false;
          return true;
        });
        return bs.length
          ? { ...f, properties: { ...f.properties, buildings: bs } }
          : null;
      }).filter(Boolean)
    };
  }, [data, filters, selectedPeriod]);

  // update map source & clear building if filtered out
  useEffect(() => {
    const src = map.current?.getSource('sites');
    if (src) src.setData(filteredData);
    if (selectedBuildingDocId) {
      const exists = filteredData.features.some(f =>
        f.properties.buildings.some(b => b.doc_id === selectedBuildingDocId)
      );
      if (!exists) setSelectedBuildingDocId(null);
    }
  }, [filteredData, selectedBuildingDocId]);

  // filter toggles
  const toggleFilter = (attr, v) =>
    setFilters(prev => {
      const next = { ...prev };
      const set = new Set(prev[attr]);
      set.has(v) ? set.delete(v) : set.add(v);
      next[attr] = set;
      return next;
    });
  const toggleDropdown = attr =>
    setDropdownOpen(prev => ({ ...prev, [attr]: !prev[attr] }));
  const clearFilters = () => {
    setFilters({ order: new Set(), morphology: new Set(), age: new Set() });
    setSelectedPeriod(null);
  };
  const exitSite = () => {
    setSelectedSite(null);
    setSelectedBuildingDocId(null);
  };

  // find the selected site & building object
  const siteFeat = filteredData.features.find(f => f.properties.site === selectedSite);
  const buildingObj = siteFeat?.properties.buildings.find(
    b => b.doc_id === selectedBuildingDocId
  );

  // timeline hover/selection
  const displayedSeg = useMemo(() => {
    const id = hoveredSegment || selectedPeriod;
    return id ? timelineSegments.find(s => s.id === id) : null;
  }, [hoveredSegment, selectedPeriod]);

  const originalSiteFeat = selectedSite
  ? data.features.find(f => f.properties.site === selectedSite)
  : null;

  const originalBuildings = originalSiteFeat
    ? originalSiteFeat.properties.buildings
    : [];

  const visibleDocIds = new Set(
    // these are the ones that passed your filters
    filteredData.features
      .find(f => f.properties.site === selectedSite)
      ?.properties.buildings
      .map(b => b.doc_id) || []
  );

  return (
    <div style={{
      position: 'relative', height: '100vh',
      fontFamily: 'Arial, sans-serif', overflow: 'hidden'
    }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* FILTER PANEL */}
      <div style={{
        position: 'absolute', top: 10, left: 10, background: '#fff',
        padding: '10px', borderRadius: '8px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        maxWidth: '30%', zIndex: 1
      }}>
        <button onClick={clearFilters}
          style={{ ...buttonStyle, background: '#eee', color: '#333' }}>
          Clear Filters
        </button>
        {['order','morphology','age'].map(attr => (
          <div key={attr}>
            <button onClick={() => toggleDropdown(attr)} style={headerStyle}>
            {attr === 'morphology' ? 'Typology' : attr[0].toUpperCase() + attr.slice(1)} {dropdownOpen[attr] ? '▲' : '▼'}
            </button>
            {dropdownOpen[attr] && allOptions[attr].map(v => (
              <button key={v} onClick={() => toggleFilter(attr, v)}
                style={{
                  ...buttonStyle,
                  background: filters[attr].has(v) ? activeColor : '#eee',
                  color: filters[attr].has(v) ? '#fff' : '#333'
                }}>
                {v}
              </button>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          {Object.entries(filters).flatMap(([attr, set]) =>
            Array.from(set).map(v => (
              <button key={`${attr}-${v}`} onClick={() => toggleFilter(attr, v)}
                style={{ ...buttonStyle, background: activeColor, color: '#fff' }}>
                {v}
              </button>
          )))}
        </div>
      </div>

      {/* SIDE PANEL */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: `${PANEL_WIDTH}px`, height: '100%',
        background: '#fafafa', borderLeft: "1px solid #ddd",
        transform: siteFeat ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease', padding: '16px',
        boxSizing: 'border-box', overflowY: 'auto', zIndex: 2
      }}>
        <button onClick={exitSite} style={{
          ...buttonStyle, position: 'absolute', bottom: 20, left: 20,
          background: '#ddd', color: '#333'
        }}>Exit Site</button>

        {!siteFeat && <div style={{ marginTop: 40 }}>Select a site to view details</div>}

        {/* LIST OF BUILDINGS */}
        {siteFeat && !buildingObj && (
          <>
            <h3 style={{ marginBottom: 8 }}>{siteFeat.properties.site}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {originalBuildings.map(b => {
                const isVisible = visibleDocIds.has(b.doc_id);
                return (
                  <li key={b.doc_id} style={{ marginBottom: 6 }}>
                    <button
                      onClick={() => isVisible && setSelectedBuildingDocId(b.doc_id)}
                      disabled={!isVisible}
                      style={{
                        ...buttonStyle,
                        background: isVisible ? '#eee' : '#f5f5f5',
                        color: isVisible ? '#333' : '#aaa',
                        cursor: isVisible ? 'pointer' : 'not-allowed',
                        border: isVisible ? 'none' : '1px solid #ddd'
                      }}
                    >
                      {b.id} <small>({b.doc_id})</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* BUILDING DETAILS */}
        {buildingObj && (
          <>
            <h3 style={{ marginBottom: 8 }}>{buildingObj.id}</h3>

            {['order','morphology','age'].map(attr =>
              buildingObj[attr]?.length > 0 && (
                <div key={attr} style={{ marginBottom: 10 }}>
                 <strong style={{ textTransform: 'capitalize' }}>{attr === 'morphology' ? 'Typology' : attr[0].toUpperCase() + attr.slice(1)}:</strong>
                  <div style={{ marginTop: 4 }}>
                    {buildingObj[attr].map(v => (
                      <button key={v} onClick={() => toggleFilter(attr, v)}
                        style={{
                          ...buttonStyle,
                          background: filters[attr].has(v) ? activeColor : '#eee',
                          color: filters[attr].has(v) ? '#fff' : '#333'
                        }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            {buildingObj.date?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <strong>Date:</strong> {buildingObj.date.join(', ')}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <strong>Doc:</strong>{' '}
              <a href={buildingObj.url} target="_blank" rel="noopener noreferrer"
                 style={{ color: '#007cbf' }}>
                {buildingObj.doc_id}
              </a>
            </div>

            {(buildingObj.style_evidence?.some(t => t.split(/\s+/).length > 5) ||
              buildingObj.date_evidence?.some(t => t.split(/\s+/).length > 5)) && (
              <div style={{ marginBottom: 12 }}>
                <strong>Description:</strong>
                <div style={{ marginTop: 4, fontSize: '0.85rem', color: '#555' }}>
                  {buildingObj.style_evidence
                    .filter(t => t.split(/\s+/).length > 5)
                    .slice(0, 2)
                    .map((text, i) => (
                      <div key={`se-${i}`}>- {text.slice(0, 180)}…</div>
                  ))}
                  {buildingObj.date_evidence
                    .filter(t => t.split(/\s+/).length > 5)
                    .slice(0, 2)
                    .map((text, i) => (
                      <div key={`de-${i}`}>- {text.slice(0, 180)}…</div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setSelectedBuildingDocId(null)}
              style={{ ...buttonStyle, background: '#ddd', color: '#333' }}>
              Back
            </button>
          </>
        )}
      </div>

      {/* TIMELINE BAR + Tooltip */}
      {/* <div style={{
        position: 'absolute',
        bottom: '35px',
        left: '4%',
        width: '75%',
        zIndex: 1
      }}> */}
        <div style={{
          position: 'absolute',
          bottom: `${TIMELINE_MARGIN}px`,
          left:   `${TIMELINE_MARGIN}px`,
          width:  `calc(100vw - ${PANEL_WIDTH}px - ${TIMELINE_MARGIN * 2}px)`,
          zIndex: 1
        }}>
        {displayedSeg && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${((displayedSeg.end - displayedSeg.start)/TOTAL_SPAN)*100}%`,
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid #ccc',
            borderRadius: 4,
            padding: '4px 8px',
            textAlign: 'center',
            fontSize: '0.8rem',
            pointerEvents: 'none',
            zIndex: 2
          }}>
            <strong>{displayedSeg.label}</strong><br/>
            {displayedSeg.tags.join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', height: '10px' }}>
          {timelineSegments.map(seg => {
            const active = selectedPeriod === seg.id;
            return (
              <div key={seg.id}
                onClick={() => setSelectedPeriod(active ? null : seg.id)}
                onMouseEnter={() => setHoveredSegment(seg.id)}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{
                  width: `${((seg.end - seg.start)/TOTAL_SPAN)*100}%`,
                  borderLeft: '1px solid #888',
                  background: active ? activeColor : inactiveColor,
                  cursor: 'pointer'
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
