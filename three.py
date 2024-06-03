import streamlit as st
import time

import sys
import numpy as np
import pandas as pd

import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import matplotlib.pyplot as plt
import plotly.express as px
from plotly.subplots import make_subplots
import plotly.graph_objects as go

import plotly.express as px
from datetime import datetime as dt

sys.setrecursionlimit(100000)
#print("Installed Dependencies")

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)
    
import random # library for random number generation
import matplotlib.cm as cm
import matplotlib.colors as colors
#%matplotlib inline 
    
#!conda install -c conda-forge geopy --yes 
from geopy.geocoders import Nominatim # module to convert an address into latitude and longitude values
    
# libraries for displaying images
from IPython.display import Image 
from IPython.core.display import HTML 
        
import requests # library to handle requests
import json # library to handle JSON files
from pandas import json_normalize # tranform JSON file into a pandas dataframe
    
#!conda install -c conda-forge folium=0.5.0 --yes
import folium # plotting library
from folium import plugins
from streamlit_folium import folium_static
#from streamlit_folium import folium_static


def app():
    st.title("MENTAL HEALTH ANALYSIS IN THE UK")
    
    st.header("PART 3")
    
    st.subheader("Loading the Data....")
    
        
    file = st.file_uploader("Upload file")
    show_file = st.empty()
    
    if not file:
        show_file.info("Please upload a file of type: " + ", ".join([".csv", ".xls", ".xlsx"]))
        return
    
    label = st.empty()
    bar = st.progress(0)
    
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
    
    ethnicity = data.melt(id_vars=["Ethnicity"], var_name = "Year", value_name = "Percentage")
    # ethnicity.sort_values(["Year"], inplace = True)
    ethnicity
  
    if st.checkbox("Show Mental Health Data"):    
        # data
        st.dataframe(ethnicity)
        
        st.write("With respect to the gathered resources, ")
    
    st.header("Data Visualization")
    
    st.subheader("Scatter Plot")
    
    # Scatter Plot
    if st.checkbox("Percentage of Diverse Ethnicity in The UK (By Year)"):  
        fig = px.bar(ethnicity, x="Ethnicity", y="Percentage", color="Ethnicity", barmode="group", 
            # facet_row="Mental Status", 
             facet_col="Year")
        fig.update_xaxes(rangeslider_visible=False, showline=True, linewidth=2, linecolor='black', mirror=True)
        fig.update_yaxes(showline=True, linewidth=2, linecolor='black', mirror=True)
        # fig.update_traces(marker_color='rgb(158,202,225)', marker_line_color='rgb(8,48,107)', marker_line_width=1.5, opacity=0.6)
        fig.update_layout(height=500, width=2000, title_text="Percentage of Anxiety within Diverse Ethnicity in The UK")
        # fig.show()
        st.plotly_chart(fig) 
    
    # Scatter Plot        
    if st.checkbox("Percentage of Diverse Ethnicity in The UK (By Ethnicity)"):  
        fig = px.bar(ethnicity, x="Year", y="Percentage", color="Ethnicity", barmode="group", 
            # facet_row="Mental Status", 
             facet_col="Ethnicity")
        fig.update_xaxes(rangeslider_visible=False, showline=True, linewidth=2, linecolor='black', mirror=True)
        fig.update_yaxes(showline=True, linewidth=2, linecolor='black', mirror=True)
        # fig.update_traces(marker_color='rgb(158,202,225)', marker_line_color='rgb(8,48,107)', marker_line_width=1.5, opacity=0.6)
        fig.update_layout(height=500, width=2000, title_text="Percentage of Anxiety within Diverse Ethnicity in The UK")
        # fig.show()
        st.plotly_chart(fig)
        