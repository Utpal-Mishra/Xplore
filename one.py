import streamlit as st

from tqdm import tqdm

import requests # library to handle requests
import pandas as pd # library for data analsysis
import numpy as np # library to handle data in a vectorized manner
import random # library for random number generation

#!conda install -c conda-forge geopy --yes
from geopy.geocoders import Nominatim # module to convert an address into latitude and longitude values

# libraries for displaying images
from IPython.display import Image
from IPython.core.display import HTML

# tranforming json file into a pandas dataframe library
#from pandas.io.json import json_normalize
from pandas import json_normalize

#!conda install -c conda-forge folium=0.5.0 --yes
import folium # plotting library

import random # library for random number generation
import numpy as np # library for vectorized computation
import pandas as pd # library to process data as dataframes

import matplotlib.pyplot as plt # plotting library

from sklearn.cluster import KMeans
#from sklearn.datasets.samples_generator import make_blobs

import numpy as np # library to handle data in a vectorized manner

import pandas as pd # library for data analsysis
pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)

import json # library to handle JSON files

#!conda install -c conda-forge geopy --yes # uncomment this line if you haven't completed the Foursquare API lab
from geopy.geocoders import Nominatim # convert an address into latitude and longitude values

import requests # library to handle requests
#from pandas.io.json import json_normalize
from pandas import json_normalize # tranform JSON file into a pandas dataframe

# Matplotlib and associated plotting modules
import matplotlib.cm as cm
import matplotlib.colors as colors

# import k-means from clustering stage
from sklearn.cluster import KMeans

#!conda install -c conda-forge folium=0.5.0 --yes # uncomment this line if you haven't completed the Foursquare API lab
import folium # map rendering library

print('Libraries imported.')

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)
    
def app():
    st.title("MENTAL HEALTH ANALYSIS IN THE UK")
    
    st.header("PART 1")
    
    st.subheader("Loading the Data....")
    
        
    address = st.text_input("Enter Location: ", 'Dublin, Ireland')

    geolocator = Nominatim(user_agent="four_square")
    location = geolocator.geocode(address)
    latitude = location.latitude
    longitude = location.longitude
    st.write('The geograpical coordinate of {} are {}, {}.'.format(address, latitude, longitude))
    
    '''
    for i in range(100):
        # Update progress bar with iterations
        label.text(f'Loaded {i+1} %')
        bar.progress(i+1)
        time.sleep(0.01)
    
    path = file
    data = pd.read_csv(path)
    #print("Data Shape: ", data.shape)
    #data.head()
    
    ".... and now we're done!!!"
     
    if st.checkbox("Show DataFrame"):    
        # data
        st.dataframe(data)
        
        st.write("")
    
    mentalHealth = data.melt(id_vars=["Year"], var_name = "Mental Health", value_name = "Percentage")
    #mentalHealth.sort_values(["Year"], inplace = True)
    mentalHealth
    
    if st.checkbox("Show Mental Health Data"):    
        # data
        st.dataframe(mentalHealth)
        
        st.write("The terms - Life Satisfaction, Happiness and Worthwhile - seems to be similars but are actually juxtapose.")
        st.write("1. Life Satisfaction: Dedictates how well an individual is encapuslated with his/ her emotions alongwith the attitude, the mindset and the authority on a synptic life.")
        st.write("2. Happiness: Demostrate a state of being happy/ feeling happiness at an instance of life and not on manifolds incidents in life.")
        st.write("3. Worthwhile: Illustrates the essence of being wealth with resources such time, money, values, etc.")
    
    st.header("Data Visualization")
    
    st.subheader("Scatter Plot")
    
    # Scatter Plot
    if st.checkbox("Average Percentage For Life Happiness, Worthwhile and Happiness"):  
        fig = px.line(mentalHealth, x="Year", y="Percentage", color='Mental Health', markers=True)
        fig.update_xaxes(title_text = "Year", rangeslider_visible=False, showline=True, linewidth=2, linecolor='black', mirror=True)
        fig.update_yaxes(title_text = "Average Ratings", showline=True, linewidth=2, linecolor='black', mirror=True)
        # fig.update_traces(marker_color='rgb(158,202,225)', marker_line_color='rgb(8,48,107)', marker_line_width=1.5, opacity=0.6)
        fig.update_layout(height=500, width=1600, title_text="Average Percentage For Life Happiness, Worthwhile and Happiness") 
        #fig.show()
        st.plotly_chart(fig)   
        
        st.write("The line plot showcasw that since, over a decade, the proportion of people in the UK - London - have been experience Worthwhile over Life Happiness and Happiness.")
        st.write("It indicates that a relatively a major part of the people were filled satisfied with resources avaialability.")
        st.write("Furthermore, when compared with momentary happiness, a higher ratio of people were build with maturity and life understanding")
        '''