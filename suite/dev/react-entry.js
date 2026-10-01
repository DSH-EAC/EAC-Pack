/**
 * dev-only esbuild entry: expose React + ReactDOM as globals so the preview
 * page can hand them to the client bundle through the mocked `require`.
 * Output goes to dev/vendor/react.iife.js (gitignored, rebuilt on demand).
 */
import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'

window.__DEV_REACT__ = React
window.__DEV_REACT_DOM__ = ReactDOMClient
