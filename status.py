import streamlit as st
import requests

def app():
    st.write("")
    st.write("")
    st.write("")
    st.title("OMDENA FRANCE LOCAL CHAPTER 2021")
    st.write("")
    st.write("")
    st.write("")
    st.header("COVID-19 BEFORE-DURING ANALYSIS IN FRANCE")
    st.write("")
    st.write("")
    
       
    st.header("FIND WEATHER STATUS OF YOUR REGION")
    
    st.write("")
    
    BASEURL = "http://api.weatherapi.com/v1"
    #st.write("BASE URL: 'http://api.weatherapi.com/v1")
    APIKEY = "316171a92c5d458c85735242213008"
    #st.write("API KEY: ------------------------------")
    st.write("ENTER PLACE: ")
    Place = st.text_input("")
    
    URL = BASEURL + "/current.json?key=" + APIKEY + "&q=" + Place + "&aqi=yes"
    
    # HTTP request
    response = requests.get(URL)
    # checking the status code of the request
    if response.status_code == 200:
        
       # getting data in the json format
       data = response.json()
       
       st.header("Location Demographics for " + response.json()["location"]['name'])
       
       P1, P2, P3 = st.columns(3)
       P1.metric(label = "Place",     value = response.json()["location"]['name'])
       P1.metric(label = "Region",    value = response.json()['location']['region'])
       P1.metric(label = "Country",   value = response.json()['location']['country'])
       P2.metric(label = "Latitude",  value = str(response.json()['location']['lat']))
       P2.metric(label = "Longitude", value = str(response.json()['location']['lon']))
       P3.metric(label = "Date",      value = response.json()['location']['localtime'].split()[0])
       P3.metric(label = "Time",      value = response.json()['location']['localtime'].split()[1])
       
       st.write("")
       st.write("")
       st.write("")
       st.header("Concentration of Pollutants in the " + response.json()["location"]['name'])
       
       P1, P2, P3, P4, P5, P6 = st.columns(6)
       P1.metric(label = "CO",    value = str(round(response.json()['current']["air_quality"]["co"], 2)))
       P2.metric(label = "NO2",   value = str(round(response.json()['current']["air_quality"]["no2"], 2)))
       P3.metric(label = "O3",    value = str(round(response.json()['current']["air_quality"]["o3"], 2)))
       P4.metric(label = "SO2",   value = str(round(response.json()['current']["air_quality"]["so2"], 2)))
       P5.metric(label = "PM2.5", value = str(round(response.json()['current']["air_quality"]["pm2_5"], 2)))
       P6.metric(label = "PM10",  value = str(round(response.json()['current']["air_quality"]["pm10"], 2)))
       
       st.write("")
       st.write("")
       st.write("")
       st.header("Weather Attributes for " + response.json()["location"]['name'])
             
       P1, P2, P3, P4, P5, P6, P7 = st.columns(7)
       P1.metric(label = "Wind Speed (mph): ",  value = str(response.json()['current']["wind_mph"]))
       P1.metric(label = "Wind Speed (kph): ",  value = str(response.json()['current']["wind_kph"]))
       P1.metric(label = "Wind Degree: ",       value = str(response.json()['current']["wind_degree"]))
       P1.metric(label = "Wind Direction: ",    value = response.json()['current']["wind_dir"])
       
       P2.metric(label = "Gust (mph): ",  value = str(response.json()['current']["gust_mph"]))
       P2.metric(label = "Gust (kph): ",  value = str(response.json()['current']["gust_kph"]))       
       
       P3.metric(label = "Pressure (ml): ",  value = str(response.json()['current']["pressure_mb"]))
       P3.metric(label = "Pressure (in): ",  value = str(response.json()['current']["pressure_in"]))
       
       P4.metric(label = "Precipation (mm): ",    value = str(response.json()['current']["precip_mm"]))
       P4.metric(label = "Precipitation (in): ",  value = str(response.json()['current']["precip_in"]))      
       
       P5.metric(label = "Temperature (C): ",  value = str(response.json()['current']["feelslike_c"]))
       P5.metric(label = "Temperature (F): ",  value = str(response.json()['current']["feelslike_f"]))       
       
       P6.metric(label = "Visibility (km): ",     value = str(response.json()['current']["vis_km"]))
       P6.metric(label = "Visibility (miles): ",  value = str(response.json()['current']["vis_miles"]))
       
       P7.metric(label = "Humidity: ",  value = str(response.json()['current']["humidity"]))
       P7.metric(label = "Cloud: ",     value = str(response.json()['current']["cloud"]))
       P7.metric(label = "UV: ",        value = str(response.json()['current']["uv"]))