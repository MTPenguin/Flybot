const gui = () => {
  const jiraParts = (s) => {
    const sep = s.indexOf('-')
    const empty = []
    if (!~sep) return empty
    const alphaChars = s.substring(0, sep).toUpperCase()
    const numChars = s.substring(sep + 1)
    const num = parseInt(numChars)
    if (isNaN(num)) return [alphaChars, numChars]
    return [alphaChars, String(num).padStart(numChars.length, '0')]
  }

  const Message = {
    value: '',
    view: () => {
      return [
        m('h2', { className: 'message' }, Message.value)]
    }
  }

  const jiraDefault = String()
  const JiraInput = {
    error: '',
    wasValid: false, // Once valid, errors stick until corrected.  Errors will not show until valid once.
    value: jiraDefault,
    validate: (store = true) => {
      const [alphaStr, numStr] = jiraParts(JiraInput.value)
      // console.log('validate alphaStr, numStr:', alphaStr, numStr)
      const regEx = /^[a-zA-Z][a-zA-Z][a-zA-Z]-[0-9][0-9][0-9]$/
      const goodFormat = regEx.test(JiraInput.value)
      const parsedNum = parseInt(numStr)
      const goodNum = !isNaN(parsedNum) && parsedNum
      const error = !(JiraInput.value && goodFormat && goodNum) ? 'Please enter Jira issue with format (XXX-000)  X = Alpha, 0 = Numeric' : '';
      store && (JiraInput.error = error)
      JiraInput.wasValid = !error

      return error
    },
    isValid: () => {
      return JiraInput.error ? false : true;
    },
    view: () => {
      return [
        m('label', 'Jira issue:'),
        m('input', {
          className: JiraInput.error ? 'error' : '',
          placeholder: 'XXX-000',
          value: JiraInput.value,
          type: 'text',
          oninput: e => {
            const [alphaStr, numStr] = jiraParts(e.target.value)
            // console.log('alphaStr, numStr:', alphaStr, numStr)
            if (alphaStr && !isNaN(numStr)) {
              JiraInput.value = alphaStr + '-' + numStr;
            } else {
              JiraInput.value = e.target.value;
            }
            JiraInput.error && JiraInput.validate()
          }
        }),
        JiraInput.error && m('div.error-message', JiraInput.error)
      ];
    }
  };

  const scopeDefault = 'data'
  const ScopeInput = {
    error: '',
    value: scopeDefault,
    validate: () => {
      ScopeInput.error = !ScopeInput.value ? 'Please select issue scope' : '';
    },
    isValid: () => {
      return ScopeInput.error ? false : true;
    },
    view: () => {
      return [
        m('label', 'Scope:'),
        m('select', {
          className: ScopeInput.error ? 'error' : '',
          onchange: e => {
            ScopeInput.value = e.target.value;
            ScopeInput.error && ScopeInput.validate()
          },
          value: ScopeInput.value
        },
          [scopeDefault, 'refData', 'schema'].map(x =>
            m('option', x)
          )
        ),
        ScopeInput.error && m('div.error-message', ScopeInput.error)
      ];
    }
  };

  const IssueForm = {
    clicked: false,
    isValid() {
      JiraInput.validate();
      ScopeInput.validate();
      if (JiraInput.isValid() && ScopeInput.isValid()) {
        return true;
      }
      return false;
    },
    view() {
      return m('form', [
        m('h1',
          'Create GitHub Issue'
        ),
        // Passing component
        m(JiraInput),
        m(ScopeInput),
        m('button', {
          class: 'pure-button pure-button-primary',
          id: 'createIssueBtn',
          type: 'button',
          disabled: IssueForm.clicked || JiraInput.validate(JiraInput.wasValid || JiraInput.value.length > 6) || !(JiraInput.value && ScopeInput.value) || (JiraInput.error || ScopeInput.error),
          onclick() {
            const url = "/flybot/:owner/:repo/createIssue"
            console.log('url:', url)
            IssueForm.clicked = true
            if (IssueForm.isValid()) {
              Message.value = '**** FIRE REQUEST JiraInput.value:' + JiraInput.value
              m.request({
                method: "POST",
                url,
                params: { owner: 'MTPenguin', repo: 'AdvWorksComm' },
                body: { jira: JiraInput.value, scope: ScopeInput.value, debug: true }
              })
                .then(function (result) {
                  const message = 'GitHub issue:' + result.data.number + ' created for Jira issue:' + JiraInput.value + ' with ' + ScopeInput.value + ' scope'
                  console.log('POST message:', message)
                  console.log('POST response:', result)
                  Message.value = message
                  JiraInput.value = jiraDefault
                  JiraInput.wasValid = false
                  ScopeInput.value = scopeDefault
                  IssueForm.clicked = false
                })
                .catch(function (error) {
                  console.error(error.message, error)
                  IssueForm.clicked = false
                  Message.value = error.message === 'null' ? "Oops, something went wrong..." : error.message
                })
            }
          }
        },
          'Create Issue'
        ),
        m(Message)
      ],
        m('button', {
          class: 'pure-button pure-button-primary',
          id: 'logoutBtn',
          type: 'button',
          onclick() {
            window.location.href = 'https://github.com/logout'
          }
        },
          'LOG OUT'
        )
      )
    }
  }

  m.mount(document.body, IssueForm)
}

gui()