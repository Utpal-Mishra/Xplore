import home

import streamlit as st

st.audio(open('audio/sweet.mp3', 'rb').read(), format='audio/ogg')

PAGES = {
    "Home": home,
}

#st.sidebar.title('Navigation Bar')

#selection = st.sidebar.selectbox("Go to: \n", list(PAGES.keys()))
page = PAGES['Home']
page.app()