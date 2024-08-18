# RESOURCES
# https://docs.streamlit.io/develop/api-reference

# VERSION 1

# Foursquare
# 1. https://docs.foursquare.com/developer/reference/address-directory
# 2. https://docs.foursquare.com/developer/reference/address-form-autofill
# 3. https://docs.foursquare.com/developer/reference/local-search-map

# Folium
# 1. https://folium.streamlit.app/
# 2. https://realpython.com/python-folium-web-maps-from-data/

# Stremlit Pills
# 1. https://pypi.org/project/streamlit-pills/
# 2. https://discuss.streamlit.io/t/how-to-add-a-title-text-or-few-sample-prompts-close-to-the-chat-input/64757

# Standardize Text
# 1. https://pypi.org/project/Unidecode/
# 2. https://pypi.org/project/anyascii/0.1.6/

#--------------------------------------------------------------------------------------------------------------

# VERSION 2:

# Streamlit Range Slider
# https://docs.streamlit.io/develop/api-reference/widgets/st.slider

# Gradient Animation
# https://lottiefiles.com/animations/gradient-loader-02-juQh1tTYA0
# https://lottie.host/ca52053c-bcc2-423b-9258-1e2ebe84aa4f/vE2uf9LsAY.json
# https://lottie.host/f34a0bc0-4b98-4632-8684-4fbfadf0806f/8qPOuRLkVc.json
# https://lottie.host/bfc80cbd-79f1-4d62-ad2d-89f4e9f3278d/Z1fopF3tEc.json

# Select Box
# https://docs.streamlit.io/develop/api-reference/widgets/st.selectbox

# Toast
# https://docs.streamlit.io/develop/api-reference/status/st.toast
# https://fonts.google.com/icons?icon.set=Material+Symbols&icon.style=Outlined

# Geolocation
# https://pypi.org/project/streamlit-geolocation/

# Divider
# https://docs.streamlit.io/develop/api-reference/text/st.divider

# Infomation Message
# https://docs.streamlit.io/develop/api-reference/status/st.info

#--------------------------------------------------------------------------------------------------------------

# VERSION 3:

# Folium
# https://gis.stackexchange.com/questions/371628/get-coordinates-from-foliums-feature-latlngpopup-in-python
# https://stackoverflow.com/questions/63413571/returning-latitude-longitude-values-from-folium-map-on-mouse-click-to-python-sc

###############################################################################################################

# LIBRARIES

import streamlit as st # Version 1
# st.set_page_config(layout="wide")
from streamlit_lottie import st_lottie # Version 2
from streamlit_folium import folium_static

import requests # library to handle requests # Version 1
import numpy as np # library to handle data in a vectorized manner # Version 1
import random # library for random number generation # Version 1

# !conda install -c conda-forge geopy --yes
from geopy.geocoders import Nominatim # module to convert an address into latitude and longitude values # Version 1
import geocoder

import json # library to handle JSON files

# from pandas.io.json import json_normalize
from pandas import json_normalize # tranform JSON file into a pandas dataframe # Version 1

# !conda install -c conda-forge folium=0.5.0 --yes
import folium # plotting library # Version 1
from folium.plugins import MousePosition
# from streamlit_folium import st_folium # type: ignore

import pandas as pd # library for data analsysis
pd.set_option('display.max_columns', None) # Version 1
pd.set_option('display.max_rows', None) # Version 1

import time # Version 2

print('Libraries Imported')

###############################################################################################################

st.toast('Welcome to XPLORE!!!', icon='🎉') # icon='😍 | 🎉')
    
time.sleep(1.5)

###############################################################################################################

# @st.cache_data(experimental_allow_widgets=True)
def app():
    
    st.write("")
    st.write("")
    
    """
    backgr
    <style>
    body {
    background-image: url("https://images.unsplash.com/photo-1542281286-9e0a16bb7366");
    background-size: cover;
    }
    </style>
    '''
    
    st.markdown(background, unsafe_allow_html=True)
    """
    
    st.title("XPLORE")
    
    time.sleep(1)
    
    st.write("")
    st.write("")
    st.write("")
    
    # Version 2 -----------------------------------------------------------------------------------------------
    
    st_lottie("https://lottie.host/f34a0bc0-4b98-4632-8684-4fbfadf0806f/8qPOuRLkVc.json")
    
    time.sleep(1.5)
    
    # ---------------------------------------------------------------------------------------------------------   

    st.header("SO, WHAT DO WE HAVE AROUND?")
    
    ############################################################################################################
    
    # SECTION 1: Add Location
    
    address = st.text_input("\nEnter Location: ")
    
    if not address:
       
        st.info('Input Format: City, Country or City, County/ State, Country', icon="ℹ️")    
    
    else:

        geolocator = Nominatim(user_agent="four_square")
        location = geolocator.geocode(address)
        latitude = location.latitude
        longitude = location.longitude
        
        """
        g = geocoder.ip('me')
        st.write(g.latlng)
        st.write(geolocator.reverse(g.latlng))
        """
        
        # st.write('\nThe geograpical coordinate of {} are {}, {}.'.format(address, latitude, longitude))
               
        def get_category_type(row):
            try:
                categories_list = row['categories']
            except:
                categories_list = row['venue.categories']

            if len(categories_list) == 0:
                return None
            else:
                return categories_list[0]['name']
            
            
        CLIENT_ID     = 'BF0HGS24CHNDJE2XJ5QH5H0UFDUTIGYZ0Y4JJCREDG0Z0PE4'
        CLIENT_SECRET = 'JO5OD3ZLJSQSR5UAJNQXY2DJP1RTEHCQDWJAWQIM5PWTNHYR'
        VERSION       = '20180604'
        
        #######################################################################################################
        
        # SECTION 2: Add Radius
        
        """
        # Version 1 -------------------------------------------------------------------------------------------
        
        LIMIT = 500
        radius = st.text_input("\nEnter Radius (in KM): ", "10")
        
        # -----------------------------------------------------------------------------------------------------
        """
        
        # Version 2 -------------------------------------------------------------------------------------------
        
        LIMIT    = 500
        distance = st.slider("\nEnter Radius (in KM): ", min_value = 0, max_value = 100, value = 10)
        distance *= 1000 # in Meters
        
        # -----------------------------------------------------------------------------------------------------
        
        if distance == 0:
            
            st.warning('WARNING: Invalid Distance', icon="⚠️")
        
        else:
            
            ###################################################################################################
            
            # SECTION 3: Fetch Data
            
            """
            Version 1 -----------------------------------------------------------------------------------------
            
            radius = int(radius)*1000
            
            # -------------------------------------------------------------------------------------------------
            """
            radius = 100 # in KM
            radius *= 1000 # in Meters
            
            url    = 'https://api.foursquare.com/v2/venues/explore?&client_id={}&client_secret={}&v={}&ll={},{}&radius={}&limit={}'.format(CLIENT_ID, CLIENT_SECRET, VERSION, latitude, longitude, radius, LIMIT)
            result = requests.get(url).json()

            output = result['response']['groups'][0]['items']
            output = json_normalize(output)
            # output.head()
                        
            ###################################################################################################
            
            # SECTION 4: Create DataFrame
            
            data               = pd.DataFrame(output)
            data               = data[['venue.name', 'venue.location.address', 'venue.location.lat', 'venue.location.lng', 'venue.location.distance', 'venue.location.city', 'venue.categories']]
            data.columns       = ['Name', 'Address', 'Latitude', 'Longitude', 'Distance', 'City', 'Categories']
            data['Categories'] = data['Categories'].apply(lambda x: x[0]['name'])
            data               = data[['Name', 'Categories', 'Distance', 'Address', 'City', 'Latitude', 'Longitude']]   
            data               = data.sort_values(by = ['Distance'])
            
            data.Name          = data.Name.str.replace('Café', 'Cafe')
            data.Categories    = data.Categories.str.replace('Café', 'Cafe')            
            
            # st.dataframe(data)
                       
            ###################################################################################################

            # SECTION 5: Closest Attractions By Categories
            
            data                = pd.DataFrame(data[data.Distance <= distance])
            
            if data.empty:
                
                st.warning('WARNING: Empty DataFrame', icon="⚠️")
                
            else:
               
                st.subheader('\nCLOSEST ATTRACTIONS')
                
                attractions         = pd.DataFrame(data.Categories.value_counts()).reset_index() # .transpose())
                # attractions       = locations.rename(columns = {'Categories': 'Attractions', 'count': 'Frequency'})
                attractions.columns = ['Attractions', 'Frequency']
                # st.dataframe(attractions) 
                
                def display(dt):
                    for i in range(min(dt.shape[0], 10)):
                        st.write(i+1, dt['Attractions'].iloc[i], dt['Frequency'].iloc[i])
                    
                display(attractions)
                            
                st.divider()
                
                ###################################################################################################
                
                # SECTION 6: Category Search
                
                time.sleep(1.5)
                
                st.subheader('\nSEARCH ATTRACTIONS BY A CATEGORY')
                
                """
                # Version 1 -------------------------------------------------------------------------------------------
                
                category = st.text_input("Enter Category: ")
                """
                
                # Version 2 -------------------------------------------------------------------------------------------
            
                category = st.selectbox("Enter Category:", 
                                        tuple(list(attractions['Attractions'][:min(attractions.shape[0], 10)])),
                                        index=None,
                                        placeholder="Select Attraction Category")
            
                # ---------------------------------------------------------------------------------------------------------
                
                if category:
                    
                    # data.sort_values(by = ['Distance'], inplace = True)
                    search = data[data.Categories == category]
                    search = search.sort_values(by = ['Distance']) #, inplace = True)
                    search = search.reset_index()
                    search = search.drop('index', axis = 1)   
                    # st.dataframe(search)
                    
                    time.sleep(1)
                    
                    for i in range(search.shape[0]):
                        st.write(i+1, search.Name[i], search.Distance[i]/1000) # search.Categories[i]
                    
                    st.divider()
                    
                    ###################################################################################################
                    
                    # SECTION 7: Streamlit Map
                    
                    # map = search.rename(columns = {'Latitude': 'latitude', 'Longitude': 'longitude'})
                     
                    # st.map(map, size = 200, zoom = 12) # latitude = 'latitude', longitude = 'longitude', size=100, color='#0044ff'
                    
                    # st.divider()
                    
                    ###################################################################################################
                                  
                    # SECTION 8: Folium Maps
                    
                    Map = folium.Map(location=[latitude, longitude], zoom_start = 12)
                                        
                    folium.TileLayer(
                        tiles = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                        attr = 'Esri',
                        name = 'Esri Satellite',
                        overlay = False,
                        control = True
                    ).add_to(Map)
                    
                    folium.Marker([latitude, longitude], popup = address).add_to(Map)
                    MousePosition().add_to(Map)
                    Map.add_child(folium.LatLngPopup())
                    
                    folium_static(Map, width = 700, height = 500)
                                        
                    ###################################################################################################
                                        
                    # Marker = folium.map.FeatureGroup()
                    # Marker.add_child(folium.CircleMarker([latitude, longitude],
                    #                                             radius = 10,
                    #                                             color = 'red',
                    #                                             fill_color = 'Red',
                    #                                             popup = folium.Popup("Xplore")))
                    # Map.add_child(Marker)
                                        
                    # folium.CircleMarker(
                    #     location = [latitude, longitude],
                    #     radius = 10000,
                    #     fill = True,
                    #     # popup = folium.Popup("Xplore"),
                    # ).add_to(Map)
                    
                    # rad = 5000
                    # folium.Circle(
                    #     location = [latitude, longitude],
                    #     radius = rad,
                    #     color="red",
                    #     weight = 1,
                    #     fill_opacity = 0.2,
                    #     opacity = 1,
                    #     fill_color = "red",
                    #     fill = False,  # gets overridden by fill_color
                    #     popup = "{} Meters".format(rad), # "{} meters".format(radius),
                    #     tooltip = "",
                    # ).add_to(Map)
                    
                    # folium_static(Map, width = 700, height = 500)
                    
                    ###################################################################################################
                    
                    # folium.plugins.LocateControl().add_to(Map)

                    # # If you want get the user device position after load the map, set auto_start=True
                    # folium.plugins.LocateControl(auto_start = True).add_to(Map)
                    
                    # folium_static(Map, width = 700, height = 500)
                                                                  
                    ###################################################################################################
                                    
                    """
                    Map = folium.Map(location = [latitude, longitude], zoom_start = 12, tiles = 'Stamen Terrain')
                    
                    incidents = folium.map.FeatureGroup()

                    for lat, lng, in zip(search.Latitude, search.Longitude):
                        incidents.add_child(
                            folium.CircleMarker(
                                [lat, lng],
                                radius = 10, # define how big you want the circle markers to be
                                color='yellow',
                                fill=True,
                                fill_color='red',
                                fill_opacity=0.6
                            )
                        )

                    # add pop-up text to each marker on the map
                    latitudes = list(search.Latitude)
                    longitudes = list(search.Longitude)
                    labels = list(search.Name)

                    for lat, lng, label in zip(latitudes, longitudes, labels):
                        folium.Marker([lat, lng], popup=label).add_to(Map)

                    # add incidents to map
                    Map.add_child(incidents)
                    """
                    
                    ###################################################################################################
                    
                   