# RESOURCES
# 1. https://folium.streamlit.app/

import streamlit as st

import requests # library to handle requests
import numpy as np # library to handle data in a vectorized manner
import random # library for random number generation

#!conda install -c conda-forge geopy --yes
from geopy.geocoders import Nominatim # module to convert an address into latitude and longitude values

import json # library to handle JSON files

# from pandas.io.json import json_normalize
from pandas import json_normalize # tranform JSON file into a pandas dataframe

#!conda install -c conda-forge folium=0.5.0 --yes
import folium # plotting library

import pandas as pd # library for data analsysis
pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)

print('Libraries imported.')

def app():
    st.write("")
    st.write("")
    st.write("")
    
    """
    background = '''
    <style>
    body {
    background-image: url("https://images.unsplash.com/photo-1542281286-9e0a16bb7366");
    background-size: cover;
    }
    </style>
    '''
    
    st.markdown(background, unsafe_allow_html=True)"""
    
    st.title("XPLORE")
    
    st.write("")
    st.write("")
    st.write("")
    
    st.header("SO, WHAT DO WE HAVE AROUND?")
    
    address = st.text_input("\nEnter Location: ")
    
    if address:

        geolocator = Nominatim(user_agent="four_square")
        location = geolocator.geocode(address)
        latitude = location.latitude
        longitude = location.longitude
        
        # st.write('\nThe geograpical coordinate of {} are {}, {}.'.format(address, latitude, longitude))
        
        
        """
        Map = folium.Map(location = [latitude, longitude], zoom_start = 12, tiles = 'Stamen Terrain')
        
        Marker = folium.map.FeatureGroup()
        Marker.add_child(folium.CircleMarker([latitude, longitude],
                                                    radius = 5,
                                                    color = 'red',
                                                    fill_color = 'Red'))
        Map.add_child(Marker)
        folium.Marker([latitude, longitude], popup = address).add_to(Map)
        
        st.map(Map, zoom = 7.5)
        """
        
        
        def get_category_type(row):
            try:
                categories_list = row['categories']
            except:
                categories_list = row['venue.categories']

            if len(categories_list) == 0:
                return None
            else:
                return categories_list[0]['name']
            
            
        CLIENT_ID = 'BF0HGS24CHNDJE2XJ5QH5H0UFDUTIGYZ0Y4JJCREDG0Z0PE4'
        CLIENT_SECRET = 'JO5OD3ZLJSQSR5UAJNQXY2DJP1RTEHCQDWJAWQIM5PWTNHYR'
        VERSION = '20180604'
        
        
        LIMIT = 500
        radius = st.text_input("\nEnter Radius: ", '1000')

        url = 'https://api.foursquare.com/v2/venues/explore?&client_id={}&client_secret={}&v={}&ll={},{}&radius={}&limit={}'.format(CLIENT_ID, CLIENT_SECRET, VERSION, latitude, longitude, radius, LIMIT)
        result = requests.get(url).json()

        venues = result['response']['groups'][0]['items']
        venues = json_normalize(venues)
        #venues.head()
        data = pd.DataFrame(venues)
        data.shape


        data = data[['venue.name', 'venue.location.address', 'venue.location.lat', 'venue.location.lng', 'venue.location.distance', 'venue.location.city', 'venue.categories']]
        data.columns = ['Name', 'Address', 'Latitude', 'Longitude', 'Distance', 'City', 'Categories']
        data['Categories'] = data['Categories'].apply(lambda x: x[0]['name'])
        data = data[['Name', 'Categories', 'Distance', 'Address', 'City', 'Latitude', 'Longitude']]
        data.sort_values(by = ['Distance'], inplace = True)
        #st.dataframe(data)

        st.subheader('\nTOP 10 CLOSE ATTRACTIONS')
        venues = pd.DataFrame(data.Categories.value_counts()).reset_index() # .transpose())
        venues.rename(columns = {'index': 'Venue', 'Categories': 'Frequency'}, inplace = True)
        # st.write(venues) 
        
        for i in range(10):
            st.write(i+1, venues['Venue'][i], venues['Frequency'][i])
        
        
        st.subheader('\n')
        
        category = st.text_input("\nEnter Category: ")
        # data.sort_values(by = ['Distance'], inplace = True)
        search = data[data.Categories == category]
        search.sort_values(by = ['Distance'], inplace = True)
        search = search.reset_index()
        search = search.drop('index', axis = 1)   
        # st.dataframe(search)
        
        for i in range(search.shape[0]):
            st.write(i+1, search.Name[i], search.Categories[i], search.Distance[i])
        
        
        """
        incidents = folium.map.FeatureGroup()

        for lat, lng, in zip(data.Latitude, data.Longitude):
            incidents.add_child(
                folium.CircleMarker(
                    [lat, lng],
                    radius=5, # define how big you want the circle markers to be
                    color='yellow',
                    fill=True,
                    fill_color='red',
                    fill_opacity=0.6
                )
            )

        # add pop-up text to each marker on the map
        latitudes = list(data.Latitude)
        longitudes = list(data.Longitude)
        labels = list(data.Name)

        for lat, lng, label in zip(latitudes, longitudes, labels):
            folium.Marker([lat, lng], popup=label).add_to(Map)

        # add incidents to map
        Map.add_child(incidents)
        """
        
        
        '''
        venues_map = folium.Map(location=[latitude, longitude], zoom_start=16) # generate map centred around the Grand Central Terminal

        # add a red circle marker to represent Grand Central Terminal
        folium.CircleMarker(
            [latitude, longitude],
            radius=10,
            color='red',
            popup='Grand Central Terminal',
            fill = True,
            fill_color = 'red',
            fill_opacity = 0.6
        ).add_to(venues_map)

        # add the pizza joints as blue circle markers
        for lat, lng, label in zip(data.Latitude, data.Longitude, data.Categories):
            print(lat, lng, label)
            folium.CircleMarker(
                [lat, lng],
                radius=5,
                color='blue',
                popup=label,
                fill = True,
                fill_color='blue',
                fill_opacity=0.6
            ).add_to(venues_map)

        # display map
        st.map(venues_map)
        '''
        
        '''
        gmaps = googlemaps.Client(key='AIzaSyBChwx9C-o1f_BwdGU1MAmfNwzorqjUoTU')

        # Geocoding an address
        geocode_result = gmaps.geocode('1600 Amphitheatre Parkway, Mountain View, CA')

        # Look up an address with reverse geocoding
        reverse_geocode_result = gmaps.reverse_geocode((40.714224, -73.961452))

        # Request directions via public transit
        now = datetime.now()
        directions_result = gmaps.directions("Sydney Town Hall",
                                            "Parramatta, NSW",
                                            mode="transit",
                                            departure_time=now)

        # Validate an address with address validation
        addressvalidation_result =  gmaps.addressvalidation(['1600 Amphitheatre Pk'], 
                                                            regionCode='US',
                                                            locality='Mountain View', 
                                                            enableUspsCass=True)
        '''