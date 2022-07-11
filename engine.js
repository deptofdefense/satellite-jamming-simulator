import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import earthmap from './assets/earthmap-high.jpg';
import circle from './assets/circle.png';
import { parseTleFile as parseTleFile, getPositionFromTle, getPositionFromGroundCoords } from "./tle";
import { earthRadius } from "satellite.js/lib/constants";
import * as satellite from 'satellite.js/lib/index';


const SatelliteSize = 50;
const ixpdotp = 1440 / (2.0 * 3.141592654) ;
const lightSpeed = 299792458

let TargetDate = new Date();

const defaultOptions = {
    backgroundColor: 0x333340,
    defaultSatelliteColor: 0xff0000,
    onStationClicked: null
}

const defaultStationOptions = {
    orbitMinutes: 0,
    satelliteSize: 50
}

export class Engine {

    stations = [];

    initialize(container, options = {}) {
        this.el = container;
        this.raycaster = new THREE.Raycaster();
        this.options = { ...defaultOptions, ...options };

        this._setupScene();
        this._setupLights();
        this._addBaseObjects();

        this.render();

        window.addEventListener('resize', this.handleWindowResize);
        window.addEventListener('pointerdown', this.handleMouseDown);
    }

    dispose() {
        window.removeEventListener('pointerdown', this.handleMouseDown);
        window.removeEventListener('resize', this.handleWindowResize);
        //window.cancelAnimationFrame(this.requestID);
        
        this.raycaster = null;
        this.el = null;

        this.controls.dispose();
    }

    handleWindowResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.render();
    };

    handleMouseDown = (e) => {
        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth ) * 2 - 1,
            -(e.clientY / window.innerHeight ) * 2 + 1 );

	    this.raycaster.setFromCamera(mouse, this.camera);

        let station = null;

	    var intersects = this.raycaster.intersectObjects(this.scene.children, true);
        if (intersects && intersects.length > 0) {
            const picked = intersects[0].object;
            if (picked) {
                station = this._findStationFromMesh(picked);
            }
        }

        const cb = this.options.onStationClicked;
        if (cb) cb(station);
    }


    // __ API _________________________________________________________________


    addSatellite = (station, color, size, date) => {
        
        //const sat = this._getSatelliteMesh(color, size);
        const sat = this._getSatelliteSprite(color, size);
        const pos = this._getSatellitePositionFromTle(station, date);
        if (!pos) return;
        //const pos = { x: Math.random() * 20000 - 10000, y: Math.random() * 20000 - 10000 , z: Math.random() * 20000 - 10000, }

        sat.position.set(pos[0].x, pos[0].y, pos[0].z);
        station.eciPosition = pos[1];
        station.mesh = sat;
        station.mesh.material = this.targetMaterial;

        this.stations.push(station);

        if (station.orbitMinutes > 0) this.addOrbit(station);

        this.earth.add(sat);
    }

    removeSatellite = (station) => {
        this.earth.remove(station.mesh);
        this.render();
    }

    removeObserver = (gd) => {
        this.earth.remove(gd);
        this.render()
    }

    addObserver = (lat, long, height, material_name) => {
        const gd = this._getSatelliteSprite(0x00FF00, 200);
        const pos = getPositionFromGroundCoords(lat, long, height);
        gd.position.set(pos[0].x, pos[0].y, pos[0].z);
        var station = {};
        station.mesh = gd;
        if (material_name == 'ground'){
            station.mesh.material = this.highlightedMaterial;
        }
        else if (material_name == 'attack'){
            station.mesh.material = this.selectedMaterial;
        }
        station.gdPosition = pos[1];
        
        //this.stations.push(gd)
        this.earth.add(gd);
        return station;
    }

    computePowerRx = (eirpTransmitter, rangeM, frequencyHz) => {
        var lambda = lightSpeed/frequencyHz;
        var fspl = -10 * Math.log10(Math.pow((4*Math.PI*rangeM)/lambda, 2));
        return eirpTransmitter + fspl - 30;
    }

    loadLteFileStations = (url, color, stationOptions) => {
        const options = { ...defaultStationOptions, ...stationOptions };

        return fetch(url).then(res => {
            if (res.ok) {
                return res.text().then(text => {
                    return this._addTleFileStations(text, color, options);
                
                });
            }
        });
    }

    getAzimuthAndRange = (observerStation, satelliteStation, currentTime) => {
        var gmst = satellite.gstime(currentTime);
        var positionEci = satelliteStation.eciPosition;
        var observerGd = observerStation.gdPosition;
        var positionEcf   = satellite.eciToEcf(positionEci, gmst),
            lookAngles    = satellite.ecfToLookAngles(observerGd, positionEcf);
        return {
            'is_visible': lookAngles.elevation > 0,
            'range': lookAngles.rangeSat
        }
    }

    addOrbit = (station, initialDate = null, manualMinutes=null) => {
        if (station.orbitMinutes < 0) return;

        const revsPerDay = station.satrec.no * ixpdotp;
        const intervalMinutes = 1;
        var minutes = station.orbitMinutes || 1440 / revsPerDay;
        if (manualMinutes != null){
            minutes = manualMinutes
        }
        if (initialDate === null){
            initialDate = new Date();
        }
        //const initialDate = new Date();

        //console.log('revsPerDay', revsPerDay, 'minutes', minutes);

        if (!this.orbitMaterial) {
            this.orbitMaterial = new THREE.LineBasicMaterial({color: 0x999999, opacity: 1.0, transparent: true });
        }

        var points = [];
        
        for (var i = 0; i <= minutes; i += intervalMinutes) {
            const date = new Date(initialDate.getTime() + i * 60000);

            const pos = getPositionFromTle(station, date)[0];
            if (!pos) continue;

            points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        var orbitCurve = new THREE.Line(geometry, this.orbitMaterial);
        station.orbit = orbitCurve;
        station.mesh.material = this.targetMaterial;

        this.earth.add(orbitCurve);
        this.render();
    }

    removeOrbit = (station) => {
        if (!station || !station.orbit) return;

        this.earth.remove(station.orbit);
        station.orbit.geometry.dispose();
        station.orbit = null;
        station.mesh.material = this.material;
        this.render();
    }

    highlightStation = (station) => {
        station.mesh.material = this.highlightedMaterial;
    }

    clearStationHighlight = (station) => {
        station.mesh.material = this.material;
    }

    _addTleFileStations = (lteFileContent, color, stationOptions) => {
        const stations = parseTleFile(lteFileContent, stationOptions);

        const { satelliteSize, render } = stationOptions;

        if (render){

            stations.forEach(s => {
                this.addSatellite(s, color, satelliteSize);
            });
        }

        this.render();

        return stations;
    }


    _getSatelliteMesh = (color, size) => {
        color = color || this.options.defaultSatelliteColor;
        size = size || SatelliteSize;

        if (!this.geometry) {

            this.geometry = new THREE.BoxBufferGeometry(size, size, size);
            this.material = new THREE.MeshPhongMaterial({
                color: color,
                emissive: 0xFF4040,
                flatShading: false,
                side: THREE.DoubleSide,
            });
        }

        return new THREE.Mesh(this.geometry, this.material);
    }

    _setupSpriteMaterials = (color) => {
        if (this.material) return;
        
        this._satelliteSprite = new THREE.TextureLoader().load(circle, this.render);
        this.selectedMaterial = new THREE.SpriteMaterial({
            map: this._satelliteSprite, 
            color: 0xFF0000,
            sizeAttenuation: false
        });
        this.highlightedMaterial = new THREE.SpriteMaterial({
            map: this._satelliteSprite,
            color: 0x0dcaf0,
            sizeAttenuation: false
        });
        this.targetMaterial = new THREE.SpriteMaterial({
            map: this._satelliteSprite,
            color: 0x00FF00,
            sizeAttenuation: false
        });            
        this.material = new THREE.SpriteMaterial({
            map: this._satelliteSprite, 
            color: color, 
            sizeAttenuation: false
        });
    }

    _getSatelliteSprite = (color, size) => {
        const SpriteScaleFactor = 5000;

        this._setupSpriteMaterials(color);

        const result = new THREE.Sprite(this.material);
        result.scale.set(size / SpriteScaleFactor, size / SpriteScaleFactor, 1);
        return result;
    }

    _getSatellitePositionFromTle = (station, date) => {
        date = date || TargetDate;
        return getPositionFromTle(station, date);
    }

    updateSatellitePosition = (station, date) => {
        date = date || TargetDate;

        const pos = getPositionFromTle(station, date);
        if (!pos) return;

        station.mesh.position.set(pos[0].x, pos[0].y, pos[0].z);
        station.eciPosition = pos[1];
    }

    
    updateAllPositions = (date) => {
        if (!this.stations) return;

        this.stations.forEach(station => {
            this.updateSatellitePosition(station, date);
        });

        this.render();
    }


    // __ Scene _______________________________________________________________


    _setupScene = () => {
        const width = this.el.clientWidth;
        const height = this.el.clientHeight;

        this.scene = new THREE.Scene();

        this._setupCamera(width, height);

        this.renderer = new THREE.WebGLRenderer({
            logarithmicDepthBuffer: true,
            antialias: true
        });

        this.renderer.setClearColor(new THREE.Color(this.options.backgroundColor));
        this.renderer.setSize(width, height);

        this.el.appendChild(this.renderer.domElement);
    };

    _setupCamera(width, height) {
        var NEAR = 1e-6, FAR = 1e27;
        this.camera = new THREE.PerspectiveCamera(54, width / height, NEAR, FAR);
        this.controls = new OrbitControls(this.camera, this.el);
        this.controls.enablePan = false;
        this.controls.addEventListener('change', () => this.render());
        this.camera.position.z = -15000;
        this.camera.position.x = 15000;
        this.camera.lookAt(0, 0, 0);
    }

    _setupLights = () => {
        const sun = new THREE.PointLight(0xffffff, 1, 0);
        //sun.position.set(0, 0, -149400000);
        sun.position.set(0, 59333894, -137112541);

        const ambient = new THREE.AmbientLight(0x909090);

        this.scene.add(sun);
        this.scene.add(ambient);
    }

    _addBaseObjects = () => {
        this._addEarth();
    };

    render = () => {
        this.renderer.render(this.scene, this.camera);
        //this.requestID = window.requestAnimationFrame(this._animationLoop); 
    };



    // __ Scene contents ______________________________________________________


    _addEarth = () => {
        const textLoader = new THREE.TextureLoader();

        const group = new THREE.Group();

        // Planet
        let geometry = new THREE.SphereGeometry(earthRadius, 50, 50);
        let material = new THREE.MeshPhongMaterial({
            //color: 0x156289,
            //emissive: 0x072534,
            side: THREE.DoubleSide,
            flatShading: false,
            map: textLoader.load(earthmap, this.render)
        });

        const earth = new THREE.Mesh(geometry, material);
        group.add(earth);

        // // Axis
        // material = new THREE.LineBasicMaterial({color: 0xffffff});
        // geometry = new THREE.Geometry();
        // geometry.vertices.push(
        //     new THREE.Vector3(0, -7000, 0),
        //     new THREE.Vector3(0, 7000, 0)
        // );
        
        // var earthRotationAxis = new THREE.Line(geometry, material);
        // group.add(earthRotationAxis);

        this.earth = group;
        this.scene.add(this.earth);

    }

    _findStationFromMesh = (threeObject) => {
        for (var i = 0; i < this.stations.length; ++i) {
            const s = this.stations[i];

            if (s.mesh === threeObject) return s;
        }

        return null;
    }
}