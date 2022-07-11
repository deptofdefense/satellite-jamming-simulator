import React, { Component } from 'react';
import SearchResults from './SearchResults';
import SearchBox from './SearchBox';

class Search extends Component {

    state = { 
        searchText: ''
    }

    handleSearchChanged = (val) => {
        this.setState({searchText: val});
    }

    handleSearchComplete = (val) => {
        console.log("Search Complete")
        this.setState({searchText: ''});
    }

    render() {
        const { stations, onResultClick } = this.props;

        return (
            <div className='Search'>
                <SearchBox value={this.state.searchText} onChange={this.handleSearchChanged} />
                <SearchResults stations={stations} searchText={this.state.searchText} onResultClick={onResultClick} onSearchComplete={this.handleSearchComplete}/>
            </div>
        )
    }
}

export default Search;