import React, { useState, useEffect, useRef, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// signature timeline segments
const timelineSegments = [
  { id: 'archaic',      label: 'Archaic & Early',   start: -800, end: -480,
    tags: ['Archaic','Late Archaic','Peisistratid'] },
  { id: 'classical',    label: 'Classical',         start: -480, end: -323,
    tags: ['Early Classical','Periclean','Classical','Lycurgan Period','Late Classical'] },
  { id: 'hellenistic',  label: 'Hellenistic',       start: -323, end: -30,
    tags: ['Hellenistic','Early Hellenistic','Late Hellenistic','Seleucid','Ptolemaic','Pergamene'] },
  { id: 'republican',   label: 'Republican',        start: -509, end: -27,
    tags: ['Early Republican','Middle Republican','Late Republican','Republican','Sullan','Caesarian Period','Triumviral Period'] },
  { id: 'earlyEmpire',  label: 'Early Empire',      start: -27,  end: 192,
    tags: ['Augustan','Tiberian','Julio-Claudian','Flavian','Nerva–Trajanian','Hadrian','Antonine'] },
  { id: 'lateEmpire',   label: 'Late Empire',       start: 193,  end: 476,
    tags: ['Severan','Crisis of 3rd Century','Diocletian-Tetrarch','Constantinian','Late Roman','Late Antique'] },
];

export default function SiteMap() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  const [data, setData] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [hoveredSegment, setHoveredSegment] = useState(null);

  const [filters, setFilters] = useState({
    order: new Set(),
    morphology: new Set(),
    age: new Set(),
    date: new Set(),
  });
  const [dropdownOpen, setDropdownOpen] = useState({
    order: false,
    morphology: false,
    age: false,
  });

  // Base button style
  const buttonStyle = {
    margin: 4,
    padding: '8px 14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.3s, color 0.3s',
    fontSize: '0.9rem',
  };
  const headerStyle = {
    ...buttonStyle,
    background: '#f0f0f0',
    color: '#333',
    fontWeight: 'bold',
  };

  // Load and sanitize GeoJSON
  useEffect(() => {
    fetch('/sites.geojson')
      .then(res => res.json())
      .then(raw => {
        raw.features.forEach(f =>
          f.properties.buildings.forEach(b => {
            ['order','morphology','age','date'].forEach(attr => {
              if (Array.isArray(b[attr])) {
                b[attr] = b[attr].filter(v =>
                  v && v.toLowerCase() !== 'undetermined' && v !== '<NA>'
                );
              }
            });
          })
        );
        setData(raw);
      })
      .catch(console.error);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!data || map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [18.0, 40.0],
      zoom: 5,
    });
    map.current.on('load', () => {
      map.current.addSource('sites', { type: 'geojson', data });
      map.current.addLayer({
        id: 'sites-layer',
        type: 'circle',
        source: 'sites',
        paint: { 'circle-radius': 6, 'circle-color': '#007cbf' },
      });
      map.current.on('click', 'sites-layer', e => {
        setSelectedSite(e.features[0].properties.site);
        setSelectedBuilding(null);
      });
      map.current.on('mouseenter', 'sites-layer', () =>
        map.current.getCanvas().style.cursor = 'pointer'
      );
      map.current.on('mouseleave', 'sites-layer', () =>
        map.current.getCanvas().style.cursor = ''
      );
    });
  }, [data]);

  // Highlight selected site
  useEffect(() => {
    if (!map.current) return;
    const expr = ['case',
      ['==', ['get', 'site'], selectedSite], '#FF4136',
      '#007cbf'
    ];
    if (map.current.getLayer('sites-layer')) {
      map.current.setPaintProperty('sites-layer', 'circle-color', expr);
    }
  }, [selectedSite]);

  // Unique filter options
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
      morphology: Array.from(m).sort(),
      age: Array.from(a).sort(),
    };
  }, [data]);

  // Compute filtered features, including timeline period
  const filteredData = useMemo(() => {
    if (!data) return { type: 'FeatureCollection', features: [] };
    const periodTags = selectedPeriod
      ? new Set(timelineSegments.find(s => s.id === selectedPeriod).tags)
      : null;

    return {
      type: 'FeatureCollection',
      features: data.features
        .map(f => {
          const bs = f.properties.buildings.filter(b => {
            for (let attr of ['order','morphology','age','date']) {
              const set = filters[attr];
              if (set.size && !Array.from(set).some(v => b[attr].includes(v))) {
                return false;
              }
            }
            if (periodTags && !b.age.some(tag => periodTags.has(tag))) {
              return false;
            }
            return true;
          });
          return bs.length
            ? { ...f, properties: { ...f.properties, buildings: bs } }
            : null;
        })
        .filter(Boolean),
    };
  }, [data, filters, selectedPeriod]);

  // Update map data & clear building if filtered out
  useEffect(() => {
    const src = map.current?.getSource('sites');
    if (src) src.setData(filteredData);
    if (
      selectedBuilding &&
      !filteredData.features.some(f =>
        f.properties.buildings.some(b => b.id === selectedBuilding)
      )
    ) {
      setSelectedBuilding(null);
    }
  }, [filteredData, selectedBuilding]);

  // Toggle filter or dropdown
  const toggleFilter = (attr, v) =>
    setFilters(prev => {
      const next = { ...prev, [attr]: new Set(prev[attr]) };
      next[attr].has(v) ? next[attr].delete(v) : next[attr].add(v);
      return next;
    });
  const toggleDropdown = attr =>
    setDropdownOpen(prev => ({ ...prev, [attr]: !prev[attr] }));
  const clearFilters = () => {
    setFilters({
      order: new Set(),
      morphology: new Set(),
      age: new Set(),
      date: new Set(),
    });
    setSelectedPeriod(null);
  };
  const exitSite = () => {
    setSelectedSite(null);
    setSelectedBuilding(null);
  };

  const siteFeat = filteredData.features.find(f => f.properties.site === selectedSite);
  const buildingObj = siteFeat?.properties.buildings.find(b => b.id === selectedBuilding);

  return (
    <div style={{ position: 'relative', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Filter controls top-left */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        background: '#fff', padding: '10px', borderRadius: '8px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 1
      }}>
        <button onClick={clearFilters} style={{
          ...buttonStyle, background: '#eee', color: '#333'
        }}>Clear Filters</button>

        {['order','morphology','age'].map(attr => (
          <div key={attr}>
            <button onClick={() => toggleDropdown(attr)} style={headerStyle}>
              {attr.charAt(0).toUpperCase() + attr.slice(1)} {dropdownOpen[attr] ? '▲' : '▼'}
            </button>
            {dropdownOpen[attr] && allOptions[attr].map(v => (
              <button key={v} onClick={() => toggleFilter(attr, v)} style={{
                ...buttonStyle,
                background: filters[attr].has(v) ? '#007cbf' : '#eee',
                color: filters[attr].has(v) ? '#fff' : '#333',
              }}>
                {v}
              </button>
            ))}
          </div>
        ))}

        {/* Active filters display */}
        <div style={{ marginTop: 8 }}>
          {Object.entries(filters).flatMap(([attr, set]) =>
            Array.from(set).map(v => (
              <button key={`${attr}-${v}`} onClick={() => toggleFilter(attr, v)} style={{
                ...buttonStyle, background: '#007cbf', color: '#fff'
              }}>
                {v}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Sliding detail panel */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 320, height: '100%',
        background: '#fafafa', borderLeft: '1px solid #ddd',
        transform: siteFeat ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease', padding: '16px',
        boxSizing: 'border-box', overflowY: 'auto', zIndex: 2
      }}>
        <button onClick={exitSite} style={{
          ...buttonStyle, position: 'absolute', bottom: 20, left: 20,
          background: '#ddd', color: '#333'
        }}>Exit Site</button>

        {!siteFeat && <div style={{ marginTop: 40 }}>Select a site to view details</div>}

        {siteFeat && !buildingObj && (
          <>
            <h3 style={{ marginBottom: '8px' }}>Buildings at {siteFeat.properties.site}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {siteFeat.properties.buildings.map(b => (
                <li key={b.id} style={{ marginBottom: '6px' }}>
                  <button onClick={() => setSelectedBuilding(b.id)} style={{
                    ...buttonStyle, background: '#eee', color: '#333'
                  }}>
                    {b.id}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {buildingObj && (
          <>
            <h3 style={{ marginBottom: '8px' }}>Building {buildingObj.id}</h3>
            {['order','morphology','age','date'].map(attr => buildingObj[attr]?.length > 0 && (
              <div key={attr} style={{ marginBottom: '10px' }}>
                <strong style={{ textTransform: 'capitalize' }}>{attr}:</strong>
                <div style={{ marginTop: '4px' }}>
                  {buildingObj[attr]
                    .filter(v => v && v.toLowerCase() !== 'undetermined' && v !== '<NA>')
                    .map(v => (
                      <button key={v} onClick={() => toggleFilter(attr, v)} style={{
                        ...buttonStyle,
                        background: filters[attr].has(v) ? '#007cbf' : '#eee',
                        color: filters[attr].has(v) ? '#fff' : '#333',
                      }}>
                        {v}
                      </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginBottom: '12px' }}>
              <strong>Doc:</strong>{' '}
              <a href={buildingObj.url} target="_blank" rel="noopener noreferrer" style={{ color: '#007cbf' }}>
                {buildingObj.doc_id}
              </a>
            </div>
            <button onClick={() => setSelectedBuilding(null)} style={{
              ...buttonStyle, background: '#ddd', color: '#333'
            }}>Back</button>
          </>
        )}
      </div>

      {/* Revised Timeline bar */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: 0,
        right: 0,
        display: 'flex',
        height: '30px',
        zIndex: 1,
      }}>
        {timelineSegments.map(seg => {
          const active = selectedPeriod === seg.id;
          const hovered = hoveredSegment === seg.id;
          const bgColor = active ? '#007cbf' : '#eee';
          const textColor = hovered
            ? (active ? '#fff' : '#333')
            : 'transparent';
          return (
            <button
              key={seg.id}
              onClick={() => setSelectedPeriod(active ? null : seg.id)}
              onMouseEnter={() => setHoveredSegment(seg.id)}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{
                flex: 1,
                margin: 0,
                padding: 0,
                border: '1px solid #ccc',
                borderRadius: 0,
                background: bgColor,
                color: textColor,
                fontSize: '0.8rem',
                lineHeight: '30px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {hovered ? seg.label : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
