<template lang="pug">
  v-data-table.mt-3(
    v-model='selected',
    :headers='headers',
    :items='filteredList',
    :search='term',
    :loading='isLoading',
    item-key='id',
    rows-per-page-text='Anime per page:',
    :rows-per-page-items="[10, 15, 25, 50, 100, { text: 'All', value: -1 }]",
    class='elevation-1'
  )
    template(v-slot:items='props')
      td
        v-img(
          :src='props.item.img',
          :lazy-src='props.item.img',
          aspect-ratio='1',
          :max-height='70',
          contain
        )
          template(v-slot:placeholder)
            v-layout(
              fill-height,
              align-center,
              justify-center,
              ma-0
            )
              v-progress-circular(indeterminate)
      td.entry-title {{ props.item.title }}
      td.text-xs-right.normal-text {{ props.item.status }}
      td.text-xs-right.normal-text {{ props.item.format }}
      td.text-xs-right.normal-text {{ props.item.score }}
      td
        v-tooltip(top, lazy)
          .text-xs-right.normal-text.ellipsis(slot='activator') {{ props.item[hasTags ? 'tags' : 'note'] }}
          span {{ props.item[hasTags ? 'tags' : 'note'] }}
      td
        v-layout(column, align-center, justify-center)
          span.pb-1 {{ props.item.progress }} / {{ props.item.nbEp || '??' }}
          v-progress-linear.ma-0(:value='(props.item.progress / props.item.nbEp) * 100', :max='props.item.nbEp')
      template(v-if='isConnected')
        td
          v-btn(icon, @click='setModal(props.item)')
            v-icon edit
</template>

<script>
export default {
  name: 'Service-List',

  props: [ 'provider', 'list', 'tags', 'term', 'hasTags' ],

  mounted () {
    this.setEdit()
  },

  data () {
    return {
      selected: [],
      headers: [
        { text: 'Thumbnail', value: 'img', sortable: false, align: 'center' },
        {
          text: 'Title',
          align: 'left',
          value: 'title'
        },
        { text: 'Status', value: 'status', align: 'right' },
        { text: 'Format', value: 'format', align: 'right' },
        { text: 'Score', value: 'score', align: 'right' },
        {
          text: this.hasTags ? 'Tags' : 'Note',
          value: this.hasTags ? 'tags' : 'note',
          sortable: false,
          align: 'right'
        },
        { text: 'Progress', value: 'progress', align: 'center' }
      ]
    }
  },

  computed: {
    isConnected () {
      return this.$store.state.services[this.provider].isConnected
    },
    isLoading () {
      return this.$store.state.services[this.provider].isLoading
    },
    isEmpty () {
      return this.list && this.list.length
    },
    filteredList () {
      if (!this.hasTags || !this.tags || !this.tags.length) return this.list || []

      return this.list.filter(
        ({ tags }) => tags.split(', ').some((tag) => this.tags.includes(tag))
      )
    }
  },

  methods: {
    setModal (item) {
      this.$store.commit('services/showForm', { service: this.provider, bool: true })
      this.$store.commit('services/setFormEntry', {
        service: this.provider,
        entry: {
          ...item,
          isEdit: true
        }
      })
    },
    setEdit () {
      this.$nextTick(() => {
        const editIndex = this.headers.findIndex(({ text }) => text === 'Edit')
        const hasEdit = editIndex !== -1

        if (this.isConnected) {
          !hasEdit && this.headers.push({ text: 'Edit' })
        } else {
          hasEdit && this.headers.splice(editIndex, 1)
        }
      })
    }
  },

  watch: {
    provider () {
      this.setEdit()
    },
    isConnected () {
      this.setEdit()
    }
  }
}
</script>

<style lang="stylus" scoped>
  .entry-title
    font-size 15px
    font-weight 200
    letter-spacing 0.04em

  .normal-text
    letter-spacing 0.02em
    max-width 250px
</style>