import React, { Component, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

import "./assets/theme.css";
import { Engine } from './engine';
import InfoBox from './InfoBox';
import Search from './Search/Search';
import CoordinateInput from 'react-coordinate-input';
import { Badge } from 'react-bootstrap';
import Form from 'react-bootstrap/Form';
import DateTimeRangePicker from '@wojtekmaj/react-datetimerange-picker';
import dayjs from 'dayjs';
var utc = require('dayjs/plugin/utc');
// Bypass CORS
function getCorsFreeUrl(url) {
    return 'https://api.allorigins.win/raw?url=' + url;    
}

dayjs.extend(utc);
const now = new Date();
const fortnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
const endDefault = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(),0);


class App extends Component {    

    initial_state = {
        pause_timer: false,
        current_date: null,
        target_station: null,
        stations: [],
        attacker_station: null,
        defender_station: null,
        attacker_eirp: 0,
        defender_eirp: 30,
        selected_range: [todayMidnight, endDefault],
        step_size: 10
    }

    state = this.initial_state;

    componentDidMount() {
        this.engine = new Engine();
        this.engine.initialize(this.el);
        this.setState({
            current_date: this.state.selected_range[0]
        })

        this.addCelestrakSets();
        this.setState({
            attacker_station: this.engine.addObserver(30, -90, 0.370, 'attack'),
            defender_station: this.engine.addObserver(28.5427, -80.6490, 0.370, 'ground'),
            current_date: this.state.selected_range[0]
        })
        setInterval(this.handleTimer, 1000);
    }

    componentWillUnmount() {
        this.engine.dispose();
        this.state = this.initial_state;
    }

    handleTimer = () => {
        if(this.state?.pause_timer) return;
        if(this.state.current_date == null){
            this.setState({
                current_date: this.state.selected_range[0]
            })
        }
        else if(this.state.current_date < this.state.selected_range[1]){
            var updatedDate = this.state.current_date
            updatedDate.setTime(updatedDate.getTime()+this.state.step_size*1000)
            this.setState({
                current_date : updatedDate
            })
            this.engine.updateAllPositions(this.state.current_date);
        }
        else{
            this.setState({
                current_date: this.state.selected_range[0]
            })
        }
    }

    handleSearchResultClick = (station, date_range=null) => {
        if (!station) return;
        this.setState({
            pause_timer: true,
        });
        if (this.state.target_station != null){
            this.engine.removeOrbit(this.state.target_station);
            this.engine.removeSatellite(this.state.target_station);
        }
        let startDay = dayjs(this.state.selected_range[0])
        let endDay = dayjs(this.state.selected_range[1])

        if (date_range !== null){
            startDay = dayjs(date_range[0])
            endDay = dayjs(date_range[1])
        }

        this.engine.addSatellite(station, 0x0000FF, 50, this.state.current_date);

        this.engine.addOrbit(station, this.state.current_date, endDay.diff(startDay, 'minutes'));
        this.setState({
            target_station: station
        });
        this.engine.updateAllPositions(this.state.current_date);
        this.setState({
            pause_timer: false,
        })

    }

    updateAttackerCoords = (value, { unmaskedValue, dd, dms }) => {
        if(!dd) return;
        if (this.state.attacker_station){
            this.engine.removeObserver(this.state.attacker_station.mesh);
        }

        this.setState({
            attacker_station: this.engine.addObserver(dd[0], dd[1], 0.370, 'attack')
        });
    }

    updateDefenderCoords = (value, { unmaskedValue, dd, dms }) => {
        if(!dd) return;
        if (this.state.defender_station){
            this.engine.removeObserver(this.state.defender_station.mesh);
        }
        this.setState({
            defender_station: this.engine.addObserver(dd[0], dd[1], 0.370, 'ground')
        });
    }

    attackerRange = () => this.getStationRange(this.state.attacker_station, this.state.target_station, this.state.current_date)
    defenderRange = () => this.getStationRange(this.state.defender_station, this.state.target_station, this.state.current_date)

    updateAttackerEirp = (event) => {
        this.setState({
            attacker_eirp: parseInt(event.target.value),
        });
    }
    updateDefenderEirp = (event) => {
        this.setState({
            defender_eirp: parseInt(event.target.value),
        });
    }

    updateSimulationPeriod = (value) => {
        console.log("updating with")
        console.log(value)
        this.setState({
            pause_timer: true
        })
        this.setState({
            selected_range: value,
            current_date: value[0]
        })
        if(this.state.target_station != null){
            this.handleSearchResultClick(this.state.target_station, value);
        }

    }

    updateStepSize = (event) => {
        this.setState({
            step_size: parseInt(event.target.value),
        })
    }

    attackerPowerAtReceiver = () => this.attackerRange() > 0 
        ? this.engine?.computePowerRx(this.state.attacker_eirp, this.attackerRange(), 10000000)
        : -200000000

    defenderPowerAtReceiver = () => this.defenderRange() > 0 
        ? this.engine?.computePowerRx(this.state.defender_eirp, this.defenderRange(), 10000000)
        : -200000000

    getStationRange = (transmitterStation, targetStation, currentTime) => {
        if(transmitterStation == null || targetStation == null){
            return -1
        }
        else{
            var {is_visible, range} = this.engine.getAzimuthAndRange(transmitterStation, targetStation, currentTime);
            if(!is_visible){
                return -1
            }
            else {
                return range;
            }
        }
    }

    dbmToWats = (dbmLevel) => {
        return Math.pow(10, ((dbmLevel-30)/10))
    }

    getSinrFromDbm = (signal, interference, noise=-90) => {
        let powerSignal = Math.pow(10, ((signal-30)/10));
        let powerInterference = Math.pow(10, ((interference-30)/10));
        let powerNoise = Math.pow(10, ((noise-30)/10));
        return 10*Math.log10(powerSignal / (powerInterference + powerNoise))
    }

    render() {

        let jamBox;
        if (this.defenderRange() < 0){
            jamBox = <h1 className="bg-secondary text-white">Satellite Out of Range</h1>
        }
        else if(this.defenderPowerAtReceiver() > this.attackerPowerAtReceiver()){
            if(this.dbmToWats(this.defenderPowerAtReceiver())*.5 < this.dbmToWats(this.attackerPowerAtReceiver())){
                jamBox = <h1 className="bg-warning text-white">Signal Quality Degraded</h1>
            }
            else{
                jamBox = <h1 className="bg-success text-white">Communications Normal!</h1>
            }
        }
        else if(this.attackerPowerAtReceiver() > this.defenderPowerAtReceiver() && this.attackerRange() > 0){
            jamBox = <h1 className="bg-danger text-white">Signal Jammed!</h1>
        }
        return (
            <div>
                <br></br>
               <InfoBox current_date={dayjs(this.state.current_date?.toISOString()).local().format('YYYY-MM-DD HH:mm:ss')} satellite_name={this.state.target_station ? this.state.target_station.name : "No Target"}/>
               <div className="SimulationSettings">
                    <div className='h3'> Simulation Settings </div>
                    <h6>Target Satellite</h6>
                    <Search stations={this.state.stations} onResultClick={this.handleSearchResultClick}/>
                    <h6>Simulation Period</h6>
                    <DateTimeRangePicker className="DateTimeRange" clearIcon={null} disableClock={true} minDate={todayMidnight} maxDate={fortnight} value={this.state.selected_range} onChange={this.updateSimulationPeriod}/>
                    <br></br><br></br>
                    <h6>Simulation Step Size: {this.state.step_size}s</h6>
                    <Form.Range min="1" max="1000" defaultValue="10" onChange={this.updateStepSize}/>
               </div>
               <div className="JamBox">
                    {jamBox}
                    <p><span className="h5"><b>SINR</b> @ Target: {this.getSinrFromDbm(this.defenderPowerAtReceiver(), this.attackerPowerAtReceiver()).toFixed(2)} dB</span></p>
                    <p><span className="h5"><b>SINR (Clear)</b> @ Target: {this.getSinrFromDbm(this.defenderPowerAtReceiver(), -2000000000).toFixed(2)} dB</span></p>
               </div>
               <div>
                    <div className="AttackerCoords">
                        <span className='h6'><span className='h3 text-danger'> Attacker </span>{this.attackerRange() > 0
                            ? <Badge bg="success">Satellite Visible</Badge>
                            : <Badge bg="secondary">Satellite Not Visible</Badge>
                            }</span>
                        <br></br>
                        <label className="label h6">Jammer Coordinates&nbsp;</label>
                        <CoordinateInput className='CoordinateInput' value='30° 00′ 00″ N 090° 00′ 00″ W' placeholder='30° 00′ 00″ N 090° 00′ 00″ W' placeholderChar={null}
                            onChange={this.updateAttackerCoords}
                        />
                    </div>
                    <div className="AttackerPower">
                        <Form.Label className="h6">Attacker EIRP: {this.state.attacker_eirp} dBm</Form.Label>
                        <Form.Range min="-50" max="200" defaultValue="0" onChange={this.updateAttackerEirp}/>
                    </div>

                </div>
                <div className="DefenderCoords">
                    <span className='h6'><span className='h3 text-info'> Defender </span>{this.attackerRange() > 0
                                ? <Badge bg="success">Satellite Visible</Badge>
                                : <Badge bg="secondary">Satellite Not Visible</Badge>
                                }</span>
                            <br></br>
                    <label className="label h6 ">Ground Station Coordinates&nbsp;</label>
                    <CoordinateInput className='CoordinateInput' value='28° 34′ 24″ N 080° 39′ 03″ W' placeholder='28° 34′ 24″ N 080° 39′ 03″ W' placeholderChar={null}
                        onChange={this.updateDefenderCoords}
                    />
                    <div className="DefenderPower">
                        <Form.Label className="h6">Defender EIRP: {this.state.defender_eirp} dBm</Form.Label>
                        <Form.Range min="-50" max="200" defaultValue="30" onChange={this.updateDefenderEirp}/>
                    </div>
                </div>
                <div ref={c => this.el = c} style={{ width: '100%', height: '100%' }} />
            </div>
        )
    }

    addCelestrakSets = () => {
        this.engine.loadLteFileStations(getCorsFreeUrl('http://www.celestrak.com/NORAD/elements/active.txt'), 0xffffff, {render: false})
            .then(stations => {
                this.setState({stations});
                var defaultTarget = stations.find(obj => {
                    return obj.name?.includes("STARLINK");
                });
                if(defaultTarget != null){
                    this.handleSearchResultClick(defaultTarget);
                }
                
                //this.engine.addSatellite(stations[0], 0xFF00FF, 50)
                //this.processQuery(stations);
            });

    }

}

App.defaultProps = {
    refresh_rate: 100,
    orbit_size: 200
}

export default App;