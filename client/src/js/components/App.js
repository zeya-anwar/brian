import {Observable} from 'rx'
import {
  addQueryStringValueToPath,
  stripQueryStringValueFromPath,
  getQueryStringValueFromPath,
} from '../pathUtils'
import render from './view'
import renderAssistant from './viewAssistant'
require('../../css/normalize.css')
require('../../css/main.css')

function updateQueryStringValueFromPath(path, item, value) {
  const path2 = stripQueryStringValueFromPath(path, item)
  return addQueryStringValueToPath(path2, item, value)
}

const EDIT_KEY = 'edit'
const LEVEL_KEY = 'level'
const ITEM_KEY = 'item'
function _pathItem(path) {
  const item = parseInt(getQueryStringValueFromPath(path, ITEM_KEY), 10)
  return (isNaN(item)) ? 0 : item
}
function _setPathItem(path, item) {
  return updateQueryStringValueFromPath(path, ITEM_KEY, item)
}
function _pathLevel(path) {
  return getQueryStringValueFromPath(path, LEVEL_KEY)
}
function _setPathLevel(path, level) {
  return updateQueryStringValueFromPath(path, LEVEL_KEY, level)
}
function _isPathEdit(path) {
  return getQueryStringValueFromPath(path, EDIT_KEY) === 'true'
}
function _togglePathEdit(path) {
  return (_isPathEdit(path) ? stripQueryStringValueFromPath(path, 'edit')
                            : addQueryStringValueToPath(path, 'edit', 'true'))
}
function _albumPath(name) {
  return `/album/${name}`
}
function _albumNameFromPath(path) {
  return path === '/' ? 'start' : path === '/index.html' ? 'start' : path.split('/')[2]
}

function _isPathUser(path) {
  return (path === '/' || path === '/index.html')
}

function _isPathAssistant(path) {
  const assistant = '/assistant'
  return (path === `${assistant}.html` || path.slice(0, assistant.length) === assistant)
}


function _albumConfig(config, album) {
  return config.albums.filter(({name}) => name === album.name)[0]
}

function _albumModel(config, album) {
  //console.log('model', config, album, album.showCard)
  const albumConfig = _albumConfig(config, album)
  const albumLista = config.albums.map(a => a.name).concat(['[Show Nothing]'])
  const albumList = albumLista.filter(name => name !== albumConfig.name)
  return {
    name: albumConfig.name,
    title: `${album.edit ? '' : `Touch the photos to see more. `}This is "${albumConfig.name}".`,
    cards: albumConfig.cards.map(({label, image, album}) => {
      const image2 = (image.slice(0, 4) === 'blob' ? image : `${image}`)
      return {label, image: image2, album}
    }),
    edit: album.edit,
    level: album.level,
    changes: album.changes,
    showCard: album.showCard,
    albumList
  }
}

function _findAlbum(albums, albumName) {
  return albums.filter(({name}) => name === albumName)[0]
}

function _getParentCard(nodeStart) {
  let node = undefined;
  for (node = nodeStart;
        node.id !== 'root';
        node = node.parentElement) {
    if (node.className === 'card') {
      break;
    }
  }
  return node
}


function App({DOM, history, speech, appConfig, settings}) {
  const navBack$ = DOM.select('[data-action="back"]').events('click')
  .map({type: 'go', value: -1})

  const cleanInstall$ = appConfig
    .filter(({cleanInstall}) => cleanInstall)
    .map(config => Object.assign({}, config, {cleanInstall: false}))

// log inputs
  const x = appConfig.do(x => console.log("in: appConfig`", x))
    .subscribe()
  const x1 = settings.do(x => console.log("in: settings", x))
    .subscribe()
  const x2 = history.do(x => console.log("in: history", x))
    .subscribe()

  const navLevel$ = settings
    .map(({level}) => {
      const loc = window.location
      return _setPathLevel(`${decodeURI(loc.pathname)}${loc.search}`, level)
    })

  const navHome$ = DOM.select('[data-action="home"]').events('click')
   .merge(cleanInstall$.filter(() => !_isPathAssistant(window.location.pathname)))
   .map('/')

  const navEditMode$ = DOM.select('[data-action="edit"]').events('click')
   .map(({currentTarget}) => {
     const loc = currentTarget.ownerDocument.location // bad developer !
     const path = `${decodeURI(loc.pathname)}${loc.search}`
     return (_isPathEdit(path)) ?
     {type: 'go', value: -1} : _togglePathEdit(path)})

  const navNextItem$ = DOM.select('[data-action="next"]').events('click')
    .map(({currentTarget}) => {
      const loc = currentTarget.ownerDocument.location
      const path = `${decodeURI(loc.pathname)}${loc.search}`
      const nextItem = (_pathItem(path) + 1) % 4
      return _setPathItem(path, nextItem)
    })

  const blurLabel$ = DOM.select('.cardLabelEdit').events('blur')
    .map(({currentTarget}) => {
//      console.dir('#', currentTarget)
      const card = _getParentCard(currentTarget)
      return {
        album: card.dataset.album,
        index: card.dataset.card,
        value: currentTarget.value
      }})
   .withLatestFrom(appConfig, (update, config) => {
     const newConfig = Object.assign({}, config)
     const album = _findAlbum(newConfig.albums, update.album)
     album.cards[update.index].label = update.value
     console.log(config.albums[0].cards[0].label)
     return newConfig
   })

  const blurOption$ = DOM.select('.cardOption').events('change')
    .do(e => e.stopPropagation())
    .map(({currentTarget}) => {
      const card = _getParentCard(currentTarget)
      return {
        album: card.dataset.album,
        index: card.dataset.card,
        value: currentTarget.value
      }})
   .withLatestFrom(appConfig, (update, config) => {
     const newConfig = Object.assign({}, config)
     const album = _findAlbum(newConfig.albums, update.album)
     album.cards[update.index].album = update.value
     return newConfig
   })


 /* const load$ = DOM.select('.cardImage').events('load')
    .do(({currentTarget}) => {window.URL.revokeObjectURL(currentTarget.src)})
    .subscribe(x => console.log('revoked', x))
*/

 // TODO find a way to persist links to local files - may be impossible
  const changeImage$ = DOM.select('.fileElem').events('change')
  .filter(({currentTarget}) => currentTarget.files.length)
    .map(({currentTarget}) => {
      const image = currentTarget.nextSibling
      const file = currentTarget.files[0]
      image.src = window.URL.createObjectURL(file) // eslint immutable/no-mutation: "off"
      const card = _getParentCard(currentTarget)
      return {album: card.dataset.album,
              index: card.dataset.card,
              URL: image.src,
      }})
  .withLatestFrom(appConfig, (update, config) => {
    const newConfig = Object.assign({}, config)
    const album = _findAlbum(newConfig.albums, update.album)
    album.cards[update.index].image = update.URL
    return newConfig
  })

  const touchSpeech$ = DOM.select('[data-action="speak"]').events('click')
  .map(({currentTarget}) => currentTarget.textContent)

  /*const key$ = DOM.select('.screen').events('keydown')
    .do(({target}) => console.log("key", target))
    .subscribe()
*/
  // If editing hand click over to hidden file picker
  const selectImage$ = DOM.select('.cardImage').events('click')
   .filter(({target}) => target.previousSibling.className === 'fileElem')
   .do(e => {
     e.stopPropagation()
     e.target.previousSibling.click()
   })
   .subscribe()

 const nextAlbumId$ = appConfig
//   .do(x=>console.log('na', x))
   .map(({albums}) => albums.length + 1)
// .do(x=>console.log(x))

 const newAlbumClick$ = DOM.select('.addAlbum').events('click')
 const addNewAlbum$ = newAlbumClick$
   // .do(e => e.stopPropagation())
   .map(({target}) => {
     const card = _getParentCard(target)
     return {
       album: card.dataset.album,
       index: card.dataset.card,
     }})
  .withLatestFrom(appConfig, nextAlbumId$, (update, config, nextID) => {
    const newConfig = Object.assign({}, config)
    newConfig.albums.push({id: nextID,
      name: `Album ${nextID}`,
      cards: [{label: "One", image: "", album: ""},
      {label: "Two", image: "", album: ""},
      {label: "Three", image: "", album: ""},
      {label: "Four", image: "", album: ""}]})
    const album = _findAlbum(newConfig.albums, update.album)
    album.cards[update.index].album = `Album ${nextID}`
    return newConfig
  })


  const navNewAlbum$ = addNewAlbum$
    .combineLatest(nextAlbumId$, (config, nextID) => {
      return {name: `Album ${nextID}`}
    })
    .withLatestFrom(appConfig,
                   (album, config) => _albumConfig(config, album))
    .filter(x => x !== undefined)
    .map(albumConfig => _albumPath(albumConfig.name))
    .map(path => _togglePathEdit(path))

  const cardClick$ = DOM.select('[data-view]').events('click')
    // stop being processed in capture phase so children get a look in
   .filter(({currentTarget}) => currentTarget.dataset.edit !== 'true')

  const navScreen$ = cardClick$
    .map(({currentTarget}) => {
      return {name: currentTarget.dataset.view}
    })
    .withLatestFrom(appConfig,
                   (album, config) => _albumConfig(config, album))
    .filter(x => x !== undefined)
    .map(albumConfig => _albumPath(albumConfig.name))

  const naveHome$ = history
      .filter(({pathname}) => _isPathUser(pathname))
      .map(({search}) => `/album/start${search}`)

  const album$ = history
    .filter(({pathname}) => (pathname.slice(0, 6) === '/album' || _isPathUser(pathname)))
    .withLatestFrom(settings, ({pathname, search, action}, {changes}) => ({pathname, search, action, changes}))
    .map(({pathname, search, action, changes}) => {
      return {name: _albumNameFromPath(decodeURI(pathname)),
              edit: _isPathEdit(search),
              level: _pathLevel(search),
              changes,
              showCard: _pathItem(search)}})
  const screen$ = album$
    .withLatestFrom(appConfig,
                   (album, config) => _albumModel(config, album))

// Assistant
  const navAssistant$ = history
    .filter(({pathname}) => _isPathAssistant(pathname))
  const intentLevel0$ = DOM.select('[data-action="level0"]').events('click')
    .map({level: 0})
  const intentLevel1$ = DOM.select('[data-action="level1"]').events('click')
    .map({level: 1})
  const levelSet$ = Observable.merge(intentLevel0$, intentLevel1$)
    .startWith({level: 1})

  const intentChangesN$ = DOM.select('[data-action="changesN"]').events('click')
    .map({changes: 0})
  const intentChangesY$ = DOM.select('[data-action="changesY"]').events('click')
    .map({changes: 1})
  const changesSet$ = Observable.merge(intentChangesN$, intentChangesY$)
    .startWith({changes: 1})

  const setting$ = Observable.combineLatest(changesSet$, levelSet$, ({changes}, {level}) => ({level, changes}))

  const intentReset$ = DOM.select('[data-action="reset"]').events('click')
    .do(e => e.stopPropagation()) // stop next event resetConf getting fired - prolly the driver and bubbling
  const intentResetConf$ = DOM.select('[data-action="resetConf"]').events('click')
  const reset$ = intentResetConf$
    .map("Reset")

  const settingsResetClear$ = intentResetConf$
    .map({resetReq: false})
  const settingsReset$ = intentReset$
    .mergeMap(() => Observable.interval(2000)
      .take(1)
      .takeUntil(intentResetConf$)
      .map({resetReq: false})
      .startWith({resetReq: true}))
    .merge(settingsResetClear$)
    .withLatestFrom(setting$, ({resetReq}, settings) => ({assistant: true, resetReq, settings}))

  const screenAssistant$ = setting$
    .map(settings => ({assistant: true, resetReq: false, settings}))
    .merge(settingsReset$)

  const view$ = screen$.merge(screenAssistant$)
    .map(model => {
      const renderer = (model.assistant) ? renderAssistant : render
      return renderer(model)
    })
  const navigate$ = Observable.merge(navHome$, navBack$, navScreen$, navNextItem$, navEditMode$, naveHome$, navLevel$, navNewAlbum$)
  const speech$ = Observable.merge(touchSpeech$)

  const anyClick$ = DOM.select('#root').events('click')
  const fullScreen$ = anyClick$
    .filter(() => !_isPathAssistant(window.location.pathname))
    .map({fullScreen: true})

  return {
    DOM: view$.do(x => console.log("out: DOM", x)),
    history: navigate$.do(x => console.log("out: history", x)),
    speech: speech$.do(x => console.log("out: speech", x)),
    appConfig: Observable.merge(cleanInstall$, blurLabel$, blurOption$, changeImage$, addNewAlbum$, reset$).do(x => console.log("out: appConfig: ", x)),
    settings: Observable.merge(setting$, reset$).do(x => console.log("out: settings", x)),
    //fullScreen: fullScreen$
  }
}

export default App
